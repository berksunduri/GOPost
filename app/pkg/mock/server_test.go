package mock

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

// ---------- pathMatches ----------

func TestPathMatches(t *testing.T) {
	cases := []struct {
		pattern string
		actual  string
		want    bool
	}{
		{"/", "/", true},
		{"/", "/anything", false},
		{"/users", "/users", true},
		{"/users", "/users/", true},
		{"/users/", "/users", true},
		{"/users", "/users/123", false},
		{"/users/{id}", "/users/123", true},
		{"/users/{id}", "/users/abc-def", true},
		{"/users/{id}", "/users", false},
		{"/users/{id}/posts", "/users/123/posts", true},
		{"/users/{id}/posts/{pid}", "/users/1/posts/2", true},
		{"/users/{id}/posts/{pid}", "/users/1/posts", false},
		{"/api/v1/health", "/api/v1/health", true},
		{"/api/v1/health", "/api/v2/health", false},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("%s_vs_%s", c.pattern, c.actual), func(t *testing.T) {
			got := pathMatches(c.pattern, c.actual)
			if got != c.want {
				t.Errorf("pathMatches(%q, %q) = %v, want %v", c.pattern, c.actual, got, c.want)
			}
		})
	}
}

// ---------- specificity ordering ----------

func TestSpecificityOrdering(t *testing.T) {
	s := NewServer()

	literal := models.MockConfig{RequestID: "literal", Method: "GET", Path: "/users/me", StatusCode: 200, Body: `"literal"`, Enabled: true}
	param := models.MockConfig{RequestID: "param", Method: "GET", Path: "/users/{id}", StatusCode: 200, Body: `"param"`, Enabled: true}
	deep := models.MockConfig{RequestID: "deep", Method: "GET", Path: "/users/{id}/posts/{pid}", StatusCode: 200, Body: `"deep"`, Enabled: true}

	// Insertion order is intentionally "wrong" — param before literal.
	s.SetHandler(param)
	s.SetHandler(literal)
	s.SetHandler(deep)

	// Literal must win over param when paths both could match.
	got := s.findMatch("GET", "/users/me")
	if got == nil || got.cfg.RequestID != "literal" {
		t.Fatalf("expected literal handler, got %+v", got)
	}

	// Param wins when literal doesn't apply.
	got = s.findMatch("GET", "/users/123")
	if got == nil || got.cfg.RequestID != "param" {
		t.Fatalf("expected param handler, got %+v", got)
	}

	got = s.findMatch("GET", "/users/1/posts/2")
	if got == nil || got.cfg.RequestID != "deep" {
		t.Fatalf("expected deep handler, got %+v", got)
	}

	// Repeat to assert determinism — map order would randomize this otherwise.
	for i := 0; i < 100; i++ {
		g := s.findMatch("GET", "/users/me")
		if g == nil || g.cfg.RequestID != "literal" {
			t.Fatalf("iteration %d: expected literal, got %+v", i, g)
		}
	}
}

// ---------- enabled toggle eviction ----------

func TestSetHandlerEvictsWhenDisabled(t *testing.T) {
	s := NewServer()
	mc := models.MockConfig{RequestID: "x", Method: "GET", Path: "/x", Enabled: true, StatusCode: 200, Body: "ok"}
	s.SetHandler(mc)

	if s.findMatch("GET", "/x") == nil {
		t.Fatal("handler not registered")
	}

	mc.Enabled = false
	s.SetHandler(mc)

	if s.findMatch("GET", "/x") != nil {
		t.Fatal("disabled handler should be evicted from running set")
	}
	if got := len(s.Status().Handlers); got != 0 {
		t.Errorf("Status().Handlers = %d, want 0", got)
	}
}

// ---------- CORS ----------

func TestCORSCredentialedOrigin(t *testing.T) {
	s, port := startTestServer(t)
	defer s.Stop()

	req, _ := http.NewRequest("OPTIONS", fmt.Sprintf("http://localhost:%d/anything", port), nil)
	req.Header.Set("Origin", "http://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	req.Header.Set("Access-Control-Request-Headers", "x-custom")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://app.example.com" {
		t.Errorf("Allow-Origin = %q, want echo of request origin", got)
	}
	if got := resp.Header.Get("Access-Control-Allow-Credentials"); got != "" {
		t.Errorf("Allow-Credentials = %q, want empty (credentials disabled by default)", got)
	}
	if got := resp.Header.Get("Access-Control-Allow-Headers"); got != "x-custom" {
		t.Errorf("Allow-Headers = %q, want echo of x-custom", got)
	}
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("preflight status = %d, want 204", resp.StatusCode)
	}
}

func TestCORSWildcardWhenNoOrigin(t *testing.T) {
	s, port := startTestServer(t)
	defer s.Stop()

	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/none", port))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Allow-Origin without Origin = %q, want *", got)
	}
	if got := resp.Header.Get("Access-Control-Allow-Credentials"); got != "" {
		t.Errorf("Allow-Credentials must be empty when origin is *, got %q", got)
	}
}

// ---------- latency cancellation ----------

func TestLatencyCancelledOnDisconnect(t *testing.T) {
	s, port := startTestServer(t)
	defer s.Stop()

	s.SetHandler(models.MockConfig{
		RequestID:  "slow",
		Method:     "GET",
		Path:       "/slow",
		StatusCode: 200,
		Body:       "ok",
		LatencyMs:  5000,
		Enabled:    true,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("http://localhost:%d/slow", port), nil)

	start := time.Now()
	_, err := http.DefaultClient.Do(req)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected request to be cancelled")
	}
	if elapsed > 1*time.Second {
		t.Errorf("handler did not honor cancellation; took %v", elapsed)
	}
}

// ---------- Stop while serving ----------

func TestStopWhileServing(t *testing.T) {
	s, port := startTestServer(t)

	s.SetHandler(models.MockConfig{
		RequestID:  "slow",
		Method:     "GET",
		Path:       "/slow",
		StatusCode: 200,
		Body:       "ok",
		LatencyMs:  500,
		Enabled:    true,
	})

	// Fire a slow request asynchronously.
	done := make(chan error, 1)
	go func() {
		resp, err := http.Get(fmt.Sprintf("http://localhost:%d/slow", port))
		if err != nil {
			done <- err
			return
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		done <- nil
	}()

	time.Sleep(50 * time.Millisecond)

	stopErr := s.Stop()
	if stopErr != nil {
		t.Errorf("Stop returned error: %v", stopErr)
	}

	// Either the request completed (graceful shutdown) or was cut — both acceptable.
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("request did not finish after Stop()")
	}

	// Subsequent Start on the same port must succeed.
	if err := s.Start(port); err != nil {
		t.Fatalf("could not restart on same port: %v", err)
	}
	_ = s.Stop()
}

// ---------- concurrent SetHandler + serve ----------

func TestConcurrentSetHandlerAndServe(t *testing.T) {
	s, port := startTestServer(t)
	defer s.Stop()

	var wg sync.WaitGroup

	// Writers
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				s.SetHandler(models.MockConfig{
					RequestID:  fmt.Sprintf("h-%d-%d", id, j%4),
					Method:     "GET",
					Path:       fmt.Sprintf("/r/%d", j%4),
					StatusCode: 200,
					Body:       "ok",
					Enabled:    j%2 == 0,
				})
			}
		}(i)
	}

	// Readers
	client := &http.Client{Timeout: 2 * time.Second}
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				resp, err := client.Get(fmt.Sprintf("http://localhost:%d/r/%d", port, j%4))
				if err != nil {
					continue
				}
				_, _ = io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
			}
		}()
	}

	wg.Wait()
}

// ---------- start twice ----------

func TestStartTwiceFails(t *testing.T) {
	s := NewServer()
	port := freePort(t)
	if err := s.Start(port); err != nil {
		t.Fatal(err)
	}
	defer s.Stop()
	if err := s.Start(port); err == nil {
		t.Fatal("expected error on double start")
	}
}

// ---------- log buffer ----------

func TestLogBufferRetainsRequests(t *testing.T) {
	s, port := startTestServer(t)
	defer s.Stop()

	s.SetHandler(models.MockConfig{
		RequestID: "echo", Method: "GET", Path: "/hello", StatusCode: 201, Body: "{}", Enabled: true,
	})

	_, err := http.Get(fmt.Sprintf("http://localhost:%d/hello?x=1", port))
	if err != nil {
		t.Fatal(err)
	}
	_, _ = http.Get(fmt.Sprintf("http://localhost:%d/nope", port))

	log := s.Log()
	if len(log) < 2 {
		t.Fatalf("expected at least 2 log entries, got %d", len(log))
	}
	// Newest first.
	if log[0].Path != "/nope" {
		t.Errorf("newest entry path = %q, want /nope", log[0].Path)
	}
	if log[0].StatusCode != http.StatusNotFound {
		t.Errorf("unmatched status = %d, want 404", log[0].StatusCode)
	}
	if log[1].Path != "/hello" {
		t.Errorf("matched entry path = %q, want /hello", log[1].Path)
	}
	if log[1].MatchedID != "echo" {
		t.Errorf("MatchedID = %q, want echo", log[1].MatchedID)
	}
	if log[1].Query != "x=1" {
		t.Errorf("Query = %q, want x=1", log[1].Query)
	}
}

// ---------- helpers ----------

func startTestServer(t *testing.T) (*Server, int) {
	t.Helper()
	s := NewServer()
	port := freePort(t)
	if err := s.Start(port); err != nil {
		t.Fatalf("start: %v", err)
	}
	// Wait briefly for server to accept connections.
	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			conn.Close()
			return s, port
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("server did not become reachable")
	return nil, 0
}

func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := l.Addr().(*net.TCPAddr).Port
	l.Close()
	return port
}

// Ensure import-only deps are referenced.
var _ = strings.TrimSpace
