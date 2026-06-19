package websocket

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	gws "github.com/gorilla/websocket"
)

// startTestWSServer creates an httptest server that upgrades to WebSocket
// and echoes all messages back to the sender.
func startTestWSServer(t *testing.T) *httptest.Server {
	t.Helper()
	upgrader := gws.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			mt, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			conn.WriteMessage(mt, msg)
		}
	}))
	return srv
}

func wsURL(srv *httptest.Server) string {
	return "ws" + strings.TrimPrefix(srv.URL, "http")
}

// ==================== Unit tests (no network) ====================

func TestNewClient_InitialState(t *testing.T) {
	c := NewClient("conn-1", "ws://example.com")
	if c.connID != "conn-1" {
		t.Errorf("connID: want 'conn-1', got %q", c.connID)
	}
	if c.url != "ws://example.com" {
		t.Errorf("url mismatch")
	}
	if c.status != StatusConnecting {
		t.Errorf("initial status: want Connecting, got %s", c.status)
	}
}

func TestSend_NotConnected(t *testing.T) {
	c := NewClient("c1", "ws://example.com")
	err := c.Send("hello")
	if err == nil {
		t.Error("Send before Connect should return error")
	}
}

func TestDisconnect_BeforeConnect(t *testing.T) {
	c := NewClient("c1", "ws://example.com")
	if err := c.Disconnect(); err != nil {
		t.Errorf("Disconnect before connect should not error: %v", err)
	}
	info := c.StatusInfo()
	if info["status"] != string(StatusClosed) {
		t.Errorf("status after Disconnect: want 'closed', got %v", info["status"])
	}
}

func TestMessagesSince_Empty(t *testing.T) {
	c := NewClient("c1", "ws://example.com")
	msgs := c.MessagesSince()
	if msgs != nil {
		t.Errorf("MessagesSince on empty client should return nil, got %v", msgs)
	}
}

func TestAllMessages_Empty(t *testing.T) {
	c := NewClient("c1", "ws://example.com")
	msgs := c.AllMessages()
	if len(msgs) != 0 {
		t.Errorf("AllMessages on empty client should return [], got %v", msgs)
	}
}

func TestStatusInfo_Fields(t *testing.T) {
	c := NewClient("conn-42", "ws://example.com/chat")
	info := c.StatusInfo()

	if info["id"] != "conn-42" {
		t.Errorf("id: want 'conn-42', got %v", info["id"])
	}
	if info["url"] != "ws://example.com/chat" {
		t.Errorf("url mismatch")
	}
	if info["status"] != string(StatusConnecting) {
		t.Errorf("status: want 'connecting', got %v", info["status"])
	}
	if info["messageCount"] != 0 {
		t.Errorf("messageCount: want 0, got %v", info["messageCount"])
	}
	if info["totalBytes"] != 0 {
		t.Errorf("totalBytes: want 0, got %v", info["totalBytes"])
	}
}

func TestMessagesSince_IncrementalCursor(t *testing.T) {
	c := NewClient("c1", "ws://x")
	// Manually inject messages to bypass network
	c.mu.Lock()
	c.messages = append(c.messages,
		Message{Direction: "send", Data: "a", Size: 1},
		Message{Direction: "receive", Data: "b", Size: 1},
	)
	c.mu.Unlock()

	first := c.MessagesSince()
	if len(first) != 2 {
		t.Errorf("first poll: want 2, got %d", len(first))
	}

	second := c.MessagesSince()
	if second != nil {
		t.Errorf("second poll should return nil (cursor advanced), got %v", second)
	}

	// Add one more
	c.mu.Lock()
	c.messages = append(c.messages, Message{Direction: "receive", Data: "c", Size: 1})
	c.mu.Unlock()

	third := c.MessagesSince()
	if len(third) != 1 || third[0].Data != "c" {
		t.Errorf("third poll: want [c], got %v", third)
	}
}

func TestAllMessages_ReturnsCopy(t *testing.T) {
	c := NewClient("c1", "ws://x")
	c.mu.Lock()
	c.messages = append(c.messages, Message{Data: "original"})
	c.mu.Unlock()

	msgs := c.AllMessages()
	msgs[0].Data = "mutated"

	original := c.AllMessages()
	if original[0].Data != "original" {
		t.Error("AllMessages should return a copy, not a reference")
	}
}

func TestStatusInfo_TotalBytes(t *testing.T) {
	c := NewClient("c1", "ws://x")
	c.mu.Lock()
	c.messages = []Message{
		{Data: "hello", Size: 5},
		{Data: "world!", Size: 6},
	}
	c.mu.Unlock()

	info := c.StatusInfo()
	if info["totalBytes"] != 11 {
		t.Errorf("totalBytes: want 11, got %v", info["totalBytes"])
	}
	if info["messageCount"] != 2 {
		t.Errorf("messageCount: want 2, got %v", info["messageCount"])
	}
}

// ==================== Integration tests (real WS server) ====================

func TestConnect_Success(t *testing.T) {
	srv := startTestWSServer(t)
	defer srv.Close()

	c := NewClient("c1", wsURL(srv))
	if err := c.Connect(nil); err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer c.Disconnect()

	info := c.StatusInfo()
	if info["status"] != string(StatusConnected) {
		t.Errorf("status after connect: want 'connected', got %v", info["status"])
	}
}

func TestConnect_Unreachable(t *testing.T) {
	c := NewClient("c1", "ws://127.0.0.1:1") // nothing listening
	err := c.Connect(nil)
	if err == nil {
		t.Error("connect to unreachable address should fail")
	}
	info := c.StatusInfo()
	if info["status"] != string(StatusError) {
		t.Errorf("status after failed connect: want 'error', got %v", info["status"])
	}
}

func TestSend_And_Receive(t *testing.T) {
	srv := startTestWSServer(t)
	defer srv.Close()

	c := NewClient("c1", wsURL(srv))
	c.Connect(nil)
	defer c.Disconnect()

	if err := c.Send("ping"); err != nil {
		t.Fatalf("send: %v", err)
	}

	// Wait for echo
	deadline := time.Now().Add(2 * time.Second)
	var received []Message
	for time.Now().Before(deadline) {
		received = c.AllMessages()
		if len(received) >= 2 { // sent + received
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	var echoFound bool
	for _, m := range received {
		if m.Direction == "receive" && m.Data == "ping" {
			echoFound = true
		}
	}
	if !echoFound {
		t.Errorf("expected echo of 'ping' in received messages, got %v", received)
	}
}

func TestSend_MessageLogged(t *testing.T) {
	srv := startTestWSServer(t)
	defer srv.Close()

	c := NewClient("c1", wsURL(srv))
	c.Connect(nil)
	defer c.Disconnect()

	c.Send("hello world")

	msgs := c.AllMessages()
	var found bool
	for _, m := range msgs {
		if m.Direction == "send" && m.Data == "hello world" {
			found = true
			if m.Size != len("hello world") {
				t.Errorf("Size: want %d, got %d", len("hello world"), m.Size)
			}
			if m.Type != "text" {
				t.Errorf("Type: want 'text', got %q", m.Type)
			}
		}
	}
	if !found {
		t.Error("sent message should appear in message log")
	}
}

func TestDisconnect_SetsStatusClosed(t *testing.T) {
	srv := startTestWSServer(t)
	defer srv.Close()

	c := NewClient("c1", wsURL(srv))
	c.Connect(nil)
	c.Disconnect()

	time.Sleep(50 * time.Millisecond)
	info := c.StatusInfo()
	if info["status"] != string(StatusClosed) {
		t.Errorf("status after Disconnect: want 'closed', got %v", info["status"])
	}
}

func TestConcurrentSend(t *testing.T) {
	srv := startTestWSServer(t)
	defer srv.Close()

	c := NewClient("c1", wsURL(srv))
	c.Connect(nil)
	defer c.Disconnect()

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			c.Send("msg")
		}(i)
	}
	wg.Wait()

	msgs := c.AllMessages()
	var sent int
	for _, m := range msgs {
		if m.Direction == "send" {
			sent++
		}
	}
	if sent != 10 {
		t.Errorf("concurrent sends: want 10 sent messages, got %d", sent)
	}
}

func TestConnect_WithCustomHeaders(t *testing.T) {
	var capturedHeader string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedHeader = r.Header.Get("X-Custom")
		upgrader := gws.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		conn.Close()
	}))
	defer srv.Close()

	c := NewClient("c1", wsURL(srv))
	c.Connect(map[string]string{"X-Custom": "test-value"})

	if capturedHeader != "test-value" {
		t.Errorf("custom header: want 'test-value', got %q", capturedHeader)
	}
}
