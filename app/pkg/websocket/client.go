package websocket

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	gws "github.com/gorilla/websocket"
)

// Status represents the current state of a WebSocket connection.
type Status string

const (
	StatusConnecting Status = "connecting"
	StatusConnected  Status = "connected"
	StatusClosed     Status = "closed"
	StatusError      Status = "error"
)

// Message represents a single WebSocket message in the log.
type Message struct {
	Direction string    `json:"direction"` // "send" or "receive"
	Data      string    `json:"data"`
	Type      string    `json:"type"` // "text" or "binary"
	Timestamp time.Time `json:"timestamp"`
	Size      int       `json:"size"`
}

// Client manages a single WebSocket connection lifecycle and message log.
type Client struct {
	connID string
	url    string
	conn   *gws.Conn
	status Status
	errMsg string

	mu         sync.Mutex
	messages   []Message
	readCursor int // Index for incremental polling

	ctx    context.Context
	cancel context.CancelFunc
}

// NewClient creates a new WebSocket client (not yet connected).
func NewClient(connID, url string) *Client {
	ctx, cancel := context.WithCancel(context.Background())
	return &Client{
		connID: connID,
		url:    url,
		status: StatusConnecting,
		ctx:    ctx,
		cancel: cancel,
	}
}

// Connect opens the WebSocket connection with optional custom headers.
func (c *Client) Connect(headers map[string]string) error {
	c.mu.Lock()
	c.status = StatusConnecting
	c.mu.Unlock()

	dialer := gws.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	httpHeaders := http.Header{}
	for k, v := range headers {
		httpHeaders.Set(k, v)
	}

	conn, _, err := dialer.Dial(c.url, httpHeaders)
	if err != nil {
		c.mu.Lock()
		c.status = StatusError
		c.errMsg = err.Error()
		c.mu.Unlock()
		return fmt.Errorf("websocket dial failed: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.status = StatusConnected
	c.errMsg = ""
	c.mu.Unlock()

	go c.readLoop()
	return nil
}

// Send writes a text message to the WebSocket connection.
func (c *Client) Send(data string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return fmt.Errorf("not connected")
	}
	if c.status != StatusConnected {
		return fmt.Errorf("connection is %s", c.status)
	}

	msg := Message{
		Direction: "send",
		Data:      data,
		Type:      "text",
		Timestamp: time.Now(),
		Size:      len(data),
	}
	c.messages = append(c.messages, msg)

	return c.conn.WriteMessage(gws.TextMessage, []byte(data))
}

// Disconnect closes the WebSocket connection gracefully.
func (c *Client) Disconnect() error {
	c.cancel()

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn != nil {
		_ = c.conn.WriteMessage(gws.CloseMessage, gws.FormatCloseMessage(gws.CloseNormalClosure, ""))
		err := c.conn.Close()
		c.conn = nil
		c.status = StatusClosed
		return err
	}
	c.status = StatusClosed
	return nil
}

// MessagesSince returns all messages added since the last poll (incremental).
func (c *Client) MessagesSince() []Message {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.readCursor >= len(c.messages) {
		return nil
	}
	msgs := c.messages[c.readCursor:]
	c.readCursor = len(c.messages)
	return msgs
}

// AllMessages returns the full message log.
func (c *Client) AllMessages() []Message {
	c.mu.Lock()
	defer c.mu.Unlock()

	out := make([]Message, len(c.messages))
	copy(out, c.messages)
	return out
}

// StatusInfo returns connection status details.
func (c *Client) StatusInfo() map[string]interface{} {
	c.mu.Lock()
	defer c.mu.Unlock()

	info := map[string]interface{}{
		"id":           c.connID,
		"url":          c.url,
		"status":       string(c.status),
		"messageCount": len(c.messages),
	}

	if c.errMsg != "" {
		info["error"] = c.errMsg
	}

	// Calculate total bytes
	totalSize := 0
	for _, m := range c.messages {
		totalSize += m.Size
	}
	info["totalBytes"] = totalSize

	return info
}

// readLoop continuously reads messages from the WebSocket connection.
func (c *Client) readLoop() {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		if c.status == StatusConnected {
			c.status = StatusClosed
		}
		c.mu.Unlock()
	}()

	for {
		select {
		case <-c.ctx.Done():
			return
		default:
		}

		msgType, data, err := conn.ReadMessage()
		if err != nil {
			c.mu.Lock()
			if c.status == StatusConnected {
				c.status = StatusClosed
				c.errMsg = err.Error()
			}
			c.mu.Unlock()
			return
		}

		typeLabel := "text"
		if msgType == gws.BinaryMessage {
			typeLabel = "binary"
		}

		c.mu.Lock()
		c.messages = append(c.messages, Message{
			Direction: "receive",
			Data:      string(data),
			Type:      typeLabel,
			Timestamp: time.Now(),
			Size:      len(data),
		})
		c.mu.Unlock()
	}
}
