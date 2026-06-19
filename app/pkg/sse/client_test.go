package sse

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// startSSEServer creates a test HTTP server that serves SSE events from a channel.
// Close the returned done channel to close the stream.
func startSSEServer(t *testing.T, events []string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		flusher, _ := w.(http.Flusher)
		for _, ev := range events {
			fmt.Fprint(w, ev)
			if flusher != nil {
				flusher.Flush()
			}
		}
	}))
	return srv
}

// ==================== Unit tests (no network) ====================

func TestNewClient_InitialState(t *testing.T) {
	c := NewClient("sse-1", "http://example.com/events")
	if c.connID != "sse-1" {
		t.Errorf("connID: want 'sse-1', got %q", c.connID)
	}
	if c.status != StatusConnecting {
		t.Errorf("initial status: want 'connecting', got %s", c.status)
	}
}

func TestDisconnect_BeforeConnect(t *testing.T) {
	c := NewClient("s1", "http://example.com/events")
	if err := c.Disconnect(); err != nil {
		t.Errorf("Disconnect before connect should not error: %v", err)
	}
	info := c.StatusInfo()
	if info["status"] != string(StatusClosed) {
		t.Errorf("status: want 'closed', got %v", info["status"])
	}
}

func TestEventsSince_Empty(t *testing.T) {
	c := NewClient("s1", "http://example.com/events")
	evts := c.EventsSince()
	if evts != nil {
		t.Errorf("EventsSince on empty client should return nil, got %v", evts)
	}
}

func TestAllEvents_Empty(t *testing.T) {
	c := NewClient("s1", "http://example.com/events")
	evts := c.AllEvents()
	if len(evts) != 0 {
		t.Errorf("AllEvents should return [], got %v", evts)
	}
}

func TestStatusInfo_Fields(t *testing.T) {
	c := NewClient("sse-99", "http://api.example.com/stream")
	info := c.StatusInfo()

	if info["id"] != "sse-99" {
		t.Errorf("id: want 'sse-99', got %v", info["id"])
	}
	if info["url"] != "http://api.example.com/stream" {
		t.Errorf("url mismatch")
	}
	if info["eventCount"] != 0 {
		t.Errorf("eventCount: want 0, got %v", info["eventCount"])
	}
	if info["totalBytes"] != 0 {
		t.Errorf("totalBytes: want 0, got %v", info["totalBytes"])
	}
}

func TestEventsSince_IncrementalCursor(t *testing.T) {
	c := NewClient("s1", "http://x")
	c.mu.Lock()
	c.events = append(c.events,
		Event{Data: "a"}, Event{Data: "b"},
	)
	c.mu.Unlock()

	first := c.EventsSince()
	if len(first) != 2 {
		t.Errorf("first poll: want 2, got %d", len(first))
	}

	second := c.EventsSince()
	if second != nil {
		t.Errorf("second poll should return nil, got %v", second)
	}

	c.mu.Lock()
	c.events = append(c.events, Event{Data: "c"})
	c.mu.Unlock()

	third := c.EventsSince()
	if len(third) != 1 || third[0].Data != "c" {
		t.Errorf("third poll: want [c], got %v", third)
	}
}

func TestAllEvents_ReturnsCopy(t *testing.T) {
	c := NewClient("s1", "http://x")
	c.mu.Lock()
	c.events = append(c.events, Event{Data: "original"})
	c.mu.Unlock()

	evts := c.AllEvents()
	evts[0].Data = "mutated"

	original := c.AllEvents()
	if original[0].Data != "original" {
		t.Error("AllEvents should return a copy")
	}
}

func TestStatusInfo_TotalBytes(t *testing.T) {
	c := NewClient("s1", "http://x")
	c.mu.Lock()
	c.events = []Event{{Data: "hello"}, {Data: "world!"}}
	c.mu.Unlock()

	info := c.StatusInfo()
	if info["totalBytes"] != 11 {
		t.Errorf("totalBytes: want 11, got %v", info["totalBytes"])
	}
	if info["eventCount"] != 2 {
		t.Errorf("eventCount: want 2, got %v", info["eventCount"])
	}
}

// ==================== parseInt ====================

func TestParseInt(t *testing.T) {
	cases := []struct {
		input string
		want  int
		ok    bool
	}{
		{"0", 0, true},
		{"1", 1, true},
		{"5000", 5000, true},
		{"", 0, true}, // empty string: loop never runs, returns 0 with no error
		{"abc", 0, false},
		{"12abc", 0, false},
		{"-1", 0, false},
	}
	for _, tc := range cases {
		got, err := parseInt(tc.input)
		if tc.ok && err != nil {
			t.Errorf("parseInt(%q): unexpected error: %v", tc.input, err)
		}
		if !tc.ok && err == nil {
			t.Errorf("parseInt(%q): expected error, got %d", tc.input, got)
		}
		if tc.ok && got != tc.want {
			t.Errorf("parseInt(%q): want %d, got %d", tc.input, tc.want, got)
		}
	}
}

// ==================== Integration tests (real HTTP server) ====================

func TestConnect_SSE_ReceivesEvents(t *testing.T) {
	events := []string{
		"data: hello\n\n",
		"data: world\n\n",
	}
	srv := startSSEServer(t, events)
	defer srv.Close()

	c := NewClient("s1", srv.URL)
	if err := c.Connect(nil); err != nil {
		t.Fatalf("connect: %v", err)
	}

	// Wait for events to arrive
	deadline := time.Now().Add(2 * time.Second)
	var evts []Event
	for time.Now().Before(deadline) {
		evts = c.AllEvents()
		if len(evts) >= 2 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	if len(evts) < 2 {
		t.Fatalf("want 2 events, got %d", len(evts))
	}
	if evts[0].Data != "hello" {
		t.Errorf("event[0].Data: want 'hello', got %q", evts[0].Data)
	}
	if evts[1].Data != "world" {
		t.Errorf("event[1].Data: want 'world', got %q", evts[1].Data)
	}
}

func TestConnect_SSE_ParsesAllFields(t *testing.T) {
	events := []string{
		"id: 42\nevent: update\nretry: 3000\ndata: payload\n\n",
	}
	srv := startSSEServer(t, events)
	defer srv.Close()

	c := NewClient("s1", srv.URL)
	c.Connect(nil)

	deadline := time.Now().Add(2 * time.Second)
	var evts []Event
	for time.Now().Before(deadline) {
		evts = c.AllEvents()
		if len(evts) >= 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(evts) == 0 {
		t.Fatal("no events received")
	}
	e := evts[0]
	if e.ID != "42" {
		t.Errorf("ID: want '42', got %q", e.ID)
	}
	if e.EventType != "update" {
		t.Errorf("EventType: want 'update', got %q", e.EventType)
	}
	if e.Retry != 3000 {
		t.Errorf("Retry: want 3000, got %d", e.Retry)
	}
	if e.Data != "payload" {
		t.Errorf("Data: want 'payload', got %q", e.Data)
	}
}

func TestConnect_SSE_MultilineData(t *testing.T) {
	events := []string{
		"data: line one\ndata: line two\n\n",
	}
	srv := startSSEServer(t, events)
	defer srv.Close()

	c := NewClient("s1", srv.URL)
	c.Connect(nil)

	deadline := time.Now().Add(2 * time.Second)
	var evts []Event
	for time.Now().Before(deadline) {
		evts = c.AllEvents()
		if len(evts) >= 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(evts) == 0 {
		t.Fatal("no events received")
	}
	if evts[0].Data != "line one\nline two" {
		t.Errorf("multiline data: want 'line one\\nline two', got %q", evts[0].Data)
	}
}

func TestConnect_SSE_SkipsComments(t *testing.T) {
	events := []string{
		": this is a comment\ndata: real data\n\n",
	}
	srv := startSSEServer(t, events)
	defer srv.Close()

	c := NewClient("s1", srv.URL)
	c.Connect(nil)

	deadline := time.Now().Add(2 * time.Second)
	var evts []Event
	for time.Now().Before(deadline) {
		evts = c.AllEvents()
		if len(evts) >= 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(evts) != 1 {
		t.Fatalf("want 1 event (comment skipped), got %d", len(evts))
	}
	if evts[0].Data != "real data" {
		t.Errorf("Data: want 'real data', got %q", evts[0].Data)
	}
}

func TestConnect_SSE_Non200_Errors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	c := NewClient("s1", srv.URL)
	err := c.Connect(nil)
	if err == nil {
		t.Error("connect to non-200 endpoint should return error")
	}
	info := c.StatusInfo()
	if info["status"] != string(StatusError) {
		t.Errorf("status: want 'error', got %v", info["status"])
	}
}

func TestConnect_SSE_Unreachable(t *testing.T) {
	c := NewClient("s1", "http://127.0.0.1:1/events")
	err := c.Connect(nil)
	if err == nil {
		t.Error("connect to unreachable address should return error")
	}
}

func TestConnect_SSE_WithCustomHeaders(t *testing.T) {
	var capturedAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewClient("s1", srv.URL)
	c.Connect(map[string]string{"Authorization": "Bearer tok"})

	if capturedAuth != "Bearer tok" {
		t.Errorf("Authorization header: want 'Bearer tok', got %q", capturedAuth)
	}
}
