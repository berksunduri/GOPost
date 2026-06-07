package sse

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Status represents the current state of an SSE connection.
type Status string

const (
	StatusConnecting Status = "connecting"
	StatusConnected  Status = "connected"
	StatusClosed     Status = "closed"
	StatusError      Status = "error"
)

// Event represents a single SSE event.
type Event struct {
	ID        string    `json:"id"`
	EventType string    `json:"eventType"`
	Data      string    `json:"data"`
	Retry     int       `json:"retry,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// Client manages a single SSE connection and event log.
type Client struct {
	connID string
	url    string
	status Status
	errMsg string

	mu         sync.Mutex
	events     []Event
	readCursor int // Index for incremental polling

	ctx    context.Context
	cancel context.CancelFunc
}

// NewClient creates a new SSE client (not yet connected).
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

// Connect opens an SSE stream with optional custom headers.
func (c *Client) Connect(headers map[string]string) error {
	c.mu.Lock()
	c.status = StatusConnecting
	c.mu.Unlock()

	req, err := http.NewRequestWithContext(c.ctx, "GET", c.url, nil)
	if err != nil {
		c.setError(err)
		return fmt.Errorf("SSE request creation failed: %w", err)
	}

	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 0} // No timeout — SSE is long-lived
	resp, err := client.Do(req)
	if err != nil {
		c.setError(err)
		return fmt.Errorf("SSE connect failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		err := fmt.Errorf("SSE endpoint returned %d %s", resp.StatusCode, resp.Status)
		c.setError(err)
		return err
	}

	c.mu.Lock()
	c.status = StatusConnected
	c.errMsg = ""
	c.mu.Unlock()

	go c.readStream(resp)
	return nil
}

// Disconnect closes the SSE stream.
func (c *Client) Disconnect() error {
	c.cancel()

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.status == StatusConnected || c.status == StatusConnecting {
		c.status = StatusClosed
	}
	return nil
}

// EventsSince returns all events added since the last poll (incremental).
func (c *Client) EventsSince() []Event {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.readCursor >= len(c.events) {
		return nil
	}
	evts := c.events[c.readCursor:]
	c.readCursor = len(c.events)
	return evts
}

// AllEvents returns the full event log.
func (c *Client) AllEvents() []Event {
	c.mu.Lock()
	defer c.mu.Unlock()

	out := make([]Event, len(c.events))
	copy(out, c.events)
	return out
}

// StatusInfo returns connection status details.
func (c *Client) StatusInfo() map[string]interface{} {
	c.mu.Lock()
	defer c.mu.Unlock()

	info := map[string]interface{}{
		"id":         c.connID,
		"url":        c.url,
		"status":     string(c.status),
		"eventCount": len(c.events),
	}

	if c.errMsg != "" {
		info["error"] = c.errMsg
	}

	// Calculate total bytes
	totalSize := 0
	for _, e := range c.events {
		totalSize += len(e.Data)
	}
	info["totalBytes"] = totalSize

	return info
}

func (c *Client) setError(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.status = StatusError
	c.errMsg = err.Error()
}

// readStream reads SSE events from the response body.
func (c *Client) readStream(resp *http.Response) {
	defer resp.Body.Close()
	defer func() {
		c.mu.Lock()
		if c.status == StatusConnected {
			c.status = StatusClosed
		}
		c.mu.Unlock()
	}()

	scanner := bufio.NewScanner(resp.Body)
	// Increase buffer for large SSE data chunks
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var current Event
	current.Timestamp = time.Now()

	for scanner.Scan() {
		select {
		case <-c.ctx.Done():
			return
		default:
		}

		line := scanner.Text()

		// Empty line signals the end of an event
		if line == "" {
			if current.Data != "" {
				c.mu.Lock()
				c.events = append(c.events, current)
				c.mu.Unlock()
			}
			current = Event{Timestamp: time.Now()}
			continue
		}

		// Skip comments (lines starting with colon)
		if strings.HasPrefix(line, ":") {
			continue
		}

		// Parse SSE fields
		switch {
		case strings.HasPrefix(line, "id:"):
			current.ID = strings.TrimSpace(strings.TrimPrefix(line, "id:"))
		case strings.HasPrefix(line, "event:"):
			current.EventType = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if current.Data != "" {
				current.Data += "\n" + data
			} else {
				current.Data = data
			}
		case strings.HasPrefix(line, "retry:"):
			retryStr := strings.TrimSpace(strings.TrimPrefix(line, "retry:"))
			if n, err := parseInt(retryStr); err == nil {
				current.Retry = n
			}
		}
	}

	// If the scanner exits with an error, record it
	if err := scanner.Err(); err != nil {
		c.setError(fmt.Errorf("SSE stream read error: %w", err))
	}
}

func parseInt(s string) (int, error) {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("invalid integer: %s", s)
		}
		n = n*10 + int(c-'0')
	}
	return n, nil
}
