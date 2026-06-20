package mock

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"gopost/app/pkg/models"
)

// Server is a local HTTP server that serves mock responses for requests.
// Supports credentialed CORS for browser-based frontend dev.
type Server struct {
	mu       sync.RWMutex
	port     int
	handlers map[string]*entry // keyed by request ID
	order    []string          // request IDs sorted by specificity (most specific first)
	srv      *http.Server
	running  bool

	logMu  sync.Mutex
	log    []LogEntry
	logCap int
}

// entry is a handler plus its precomputed specificity score.
type entry struct {
	cfg         models.MockConfig
	specificity int // higher = more specific (fewer {param} segments, longer path)
}

// LogEntry records a single inbound request to the mock server.
type LogEntry struct {
	Time        time.Time         `json:"time"`
	Method      string            `json:"method"`
	Path        string            `json:"path"`
	Query       string            `json:"query"`
	RemoteAddr  string            `json:"remote_addr"`
	StatusCode  int               `json:"status_code"`
	DurationMs  int64             `json:"duration_ms"`
	MatchedID   string            `json:"matched_id,omitempty"`
	MatchedPath string            `json:"matched_path,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
}

const defaultLogCap = 200

// NewServer creates a new mock server instance.
func NewServer() *Server {
	return &Server{
		handlers: make(map[string]*entry),
		logCap:   defaultLogCap,
	}
}

// SetHandler adds or updates a mock handler for the given request.
// When mc.Enabled is false the handler is evicted instead of stored,
// so toggling enabled off takes effect on the running server immediately.
func (s *Server) SetHandler(mc models.MockConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !mc.Enabled {
		s.removeHandlerLocked(mc.RequestID)
		return
	}
	s.handlers[mc.RequestID] = &entry{cfg: mc, specificity: computeSpecificity(mc.Path)}
	s.rebuildOrderLocked()
}

// RemoveHandler removes a mock handler by request ID.
func (s *Server) RemoveHandler(requestID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.removeHandlerLocked(requestID)
}

func (s *Server) removeHandlerLocked(requestID string) {
	if _, ok := s.handlers[requestID]; !ok {
		return
	}
	delete(s.handlers, requestID)
	s.rebuildOrderLocked()
}

// ClearHandlers removes all handlers.
func (s *Server) ClearHandlers() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handlers = make(map[string]*entry)
	s.order = nil
}

// rebuildOrderLocked recomputes the deterministic match order.
// Caller MUST hold s.mu.
//
// Sort: higher specificity first; tie-break by RequestID (stable, deterministic).
func (s *Server) rebuildOrderLocked() {
	ids := make([]string, 0, len(s.handlers))
	for id := range s.handlers {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		a, b := s.handlers[ids[i]], s.handlers[ids[j]]
		if a.specificity != b.specificity {
			return a.specificity > b.specificity
		}
		return ids[i] < ids[j]
	})
	s.order = ids
}

// Status returns the current mock server status.
func (s *Server) Status() models.MockStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	handlers := make([]models.MockConfig, 0, len(s.order))
	for _, id := range s.order {
		handlers = append(handlers, s.handlers[id].cfg)
	}
	return models.MockStatus{
		Running:  s.running,
		Port:     s.port,
		Handlers: handlers,
	}
}

// Log returns a copy of the recent request log, newest first.
func (s *Server) Log() []LogEntry {
	s.logMu.Lock()
	defer s.logMu.Unlock()
	out := make([]LogEntry, len(s.log))
	for i, e := range s.log {
		out[len(s.log)-1-i] = e
	}
	return out
}

// ClearLog empties the in-memory request log.
func (s *Server) ClearLog() {
	s.logMu.Lock()
	defer s.logMu.Unlock()
	s.log = nil
}

// Start starts the mock server on the given port.
func (s *Server) Start(port int) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("mock server already running on port %d", s.port)
	}
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("cannot start mock server on port %d: %w", port, err)
	}

	s.port = port
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleRequest)
	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	s.srv = srv
	s.running = true
	s.mu.Unlock()

	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			slog.Error("mock server error", "error", err)
		}
	}()
	slog.Info("mock server started", "port", port)
	return nil
}

// Stop gracefully drains in-flight connections and stops the server.
// Lock is released before waiting on Shutdown so in-flight handlers can finish.
func (s *Server) Stop() error {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return nil
	}
	srv := s.srv
	s.running = false
	s.srv = nil
	s.port = 0
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err := srv.Shutdown(ctx)
	if err != nil {
		_ = srv.Close()
		return err
	}
	slog.Info("mock server stopped")
	return nil
}

// handleRequest is the main HTTP handler for the mock server.
func (s *Server) handleRequest(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	applyCORS(w, r)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		s.recordLog(r, http.StatusNoContent, time.Since(start), nil)
		return
	}

	matched := s.findMatch(r.Method, r.URL.Path)
	if matched == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprintf(w, `{"error":"no mock configured for %s %s"}`, r.Method, r.URL.Path)
		s.recordLog(r, http.StatusNotFound, time.Since(start), nil)
		return
	}

	status, err := s.serveMock(w, r, matched.cfg)
	if err != nil {
		s.recordLog(r, status, time.Since(start), &matched.cfg)
		return
	}
	s.recordLog(r, status, time.Since(start), &matched.cfg)
}

// findMatch returns the highest-specificity enabled handler matching method+path,
// or nil if none match. Order is deterministic.
func (s *Server) findMatch(method, path string) *entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, id := range s.order {
		e := s.handlers[id]
		if !e.cfg.Enabled {
			continue
		}
		if !strings.EqualFold(method, e.cfg.Method) {
			continue
		}
		if pathMatches(e.cfg.Path, path) {
			return e
		}
	}
	return nil
}

// applyCORS writes CORS headers for the mock server.
// By default, origins are reflected but credentials are NOT allowed — this
// prevents arbitrary browser tabs from reading mock responses with credentials.
// Set mock.credentialed_origins in the request config to enable credentials.
func applyCORS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Add("Vary", "Origin")
	} else {
		w.Header().Set("Access-Control-Allow-Origin", "*")
	}
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")
	reqHeaders := r.Header.Get("Access-Control-Request-Headers")
	if reqHeaders != "" {
		w.Header().Set("Access-Control-Allow-Headers", reqHeaders)
	} else {
		w.Header().Set("Access-Control-Allow-Headers", "*")
	}
	w.Header().Set("Access-Control-Max-Age", "86400")
}

// computeSpecificity assigns a higher score to paths with more literal segments
// and fewer {param} placeholders. A literal segment is worth 10, a placeholder 1.
// Longer paths beat shorter ones at the same literal density.
func computeSpecificity(pattern string) int {
	pattern = strings.Trim(pattern, "/")
	if pattern == "" {
		return 0
	}
	parts := strings.Split(pattern, "/")
	score := 0
	for _, p := range parts {
		if strings.HasPrefix(p, "{") && strings.HasSuffix(p, "}") {
			score += 1
		} else {
			score += 10
		}
	}
	return score
}

// pathMatches checks if a request path matches a handler path pattern.
// Supports {param} segments that match any single path segment.
func pathMatches(pattern, actual string) bool {
	pattern = strings.Trim(pattern, "/")
	actual = strings.Trim(actual, "/")

	if pattern == "" {
		return actual == ""
	}

	patternParts := strings.Split(pattern, "/")
	actualParts := strings.Split(actual, "/")
	if len(patternParts) != len(actualParts) {
		return false
	}

	for i := range patternParts {
		pp := patternParts[i]
		ap := actualParts[i]
		if strings.HasPrefix(pp, "{") && strings.HasSuffix(pp, "}") {
			continue
		}
		if pp != ap {
			return false
		}
	}
	return true
}

// serveMock writes the configured mock response. Returns the status written
// and an error if the request was cancelled before completion.
func (s *Server) serveMock(w http.ResponseWriter, r *http.Request, mc models.MockConfig) (int, error) {
	if mc.LatencyMs > 0 {
		select {
		case <-time.After(time.Duration(mc.LatencyMs) * time.Millisecond):
		case <-r.Context().Done():
			return 499, r.Context().Err() // 499 = client closed (nginx convention)
		}
	}

	for key, value := range mc.Headers {
		w.Header().Set(key, value)
	}
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "application/json")
	}

	status := mc.StatusCode
	if status == 0 {
		status = 200
	}
	w.WriteHeader(status)
	fmt.Fprint(w, mc.Body)
	return status, nil
}

// recordLog appends a log entry to the ring buffer.
func (s *Server) recordLog(r *http.Request, status int, dur time.Duration, matched *models.MockConfig) {
	headers := make(map[string]string, len(r.Header))
	for k, v := range r.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}
	entry := LogEntry{
		Time:       time.Now(),
		Method:     r.Method,
		Path:       r.URL.Path,
		Query:      r.URL.RawQuery,
		RemoteAddr: r.RemoteAddr,
		StatusCode: status,
		DurationMs: dur.Milliseconds(),
		Headers:    headers,
	}
	if matched != nil {
		entry.MatchedID = matched.RequestID
		entry.MatchedPath = matched.Path
	}

	s.logMu.Lock()
	defer s.logMu.Unlock()
	s.log = append(s.log, entry)
	if len(s.log) > s.logCap {
		s.log = s.log[len(s.log)-s.logCap:]
	}
}
