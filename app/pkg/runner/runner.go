// Package runner provides the CLI collection runner for CI/CD testing.
//
// It can load requests from GitStore collections or .http files, execute them
// sequentially or in parallel, and report results via pluggable reporters.
package runner

import (
	"net"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"gopost/app/pkg/models"
	"gopost/app/pkg/parser"
	"gopost/app/pkg/storage"
)

// Config describes a runner invocation.
type Config struct {
	CollectionPath string              // Collection name or path to .http file
	Environment    *models.Environment // Optional environment for variable substitution
	Parallel       int                 // Number of parallel workers (1 = sequential)
	Timeout        time.Duration       // Per-request timeout
	StopOnFail     bool                // Stop execution on first failure
	Reporter       string              // Reporter name: "console", "junit", "json"
	Output         string              // Output file path (empty = stdout)
}

// Result summarises a collection run.
type Result struct {
	CollectionName string          `json:"collection_name"`
	Total          int             `json:"total"`
	Passed         int             `json:"passed"`
	Failed         int             `json:"failed"`
	Duration       time.Duration   `json:"duration_ms"`
	Requests       []RequestResult `json:"requests"`
}

// ExitCode returns 0 when all requests passed, 1 otherwise.
func (r *Result) ExitCode() int {
	if r.Failed > 0 {
		return 1
	}
	return 0
}

// RequestResult describes a single request execution.
type RequestResult struct {
	Name     string `json:"name"`
	Method   string `json:"method"`
	URL      string `json:"url"`
	Status   int    `json:"status"`
	Passed   bool   `json:"passed"`
	Duration int64  `json:"duration_ms"`
	Error    string `json:"error,omitempty"`
}

// HTTPExecutor abstracts the HTTP execution so we can test without real networking.
type HTTPExecutor struct {
	Client *http.Client
}

var sharedTransport = &http.Transport{
	DialContext: (&net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext,
	MaxIdleConns:          100,
	MaxIdleConnsPerHost:   20,
	IdleConnTimeout:       90 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ExpectContinueTimeout: 1 * time.Second,
	ForceAttemptHTTP2:     true,
}

var DefaultExecutor = &HTTPExecutor{
	Client: &http.Client{Transport: sharedTransport.Clone(), Timeout: 30 * time.Second},
}

// Execute sends an HTTP request and returns the result.
func (e *HTTPExecutor) Execute(req *models.HTTPRequest, env *models.Environment) (int, string, string, int64, error) {
	urlStr := substituteVariables(req.URL, env)
	method := req.Method
	bodyStr := substituteVariables(req.Body, env)

	httpReq, err := http.NewRequest(method, urlStr, strings.NewReader(bodyStr))
	if err != nil {
		return 0, "", "", 0, fmt.Errorf("failed to create request: %w", err)
	}

	// Headers
	for k, v := range req.Headers {
		httpReq.Header.Set(k, substituteVariables(v, env))
	}
	applyAuth(httpReq, &req.Auth, env)

	start := time.Now()
	resp, err := e.Client.Do(httpReq)
	if err != nil {
		return 0, "", "", time.Since(start).Milliseconds(), err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024)) // 10MB limit
	duration := time.Since(start).Milliseconds()

	return resp.StatusCode, resp.Status, string(respBody), duration, nil
}

// Run executes all requests in a collection or .http file.
func Run(cfg Config) (*Result, error) {
	requests, collectionName, err := loadRequests(cfg.CollectionPath)
	if err != nil {
		return nil, err
	}

	if cfg.Timeout <= 0 {
		cfg.Timeout = 30 * time.Second
	}

	executor := &HTTPExecutor{
		Client: &http.Client{Transport: sharedTransport.Clone(), Timeout: cfg.Timeout},
	}

	start := time.Now()
	var requestResults []RequestResult

	if cfg.Parallel > 1 {
		requestResults = runParallel(requests, cfg, executor)
	} else {
		requestResults = runSequential(requests, cfg, executor)
	}

	passed, failed := 0, 0
	for _, rr := range requestResults {
		if rr.Passed {
			passed++
		} else {
			failed++
		}
	}

	return &Result{
		CollectionName: collectionName,
		Total:          len(requestResults),
		Passed:         passed,
		Failed:         failed,
		Duration:       time.Since(start),
		Requests:       requestResults,
	}, nil
}

// ==================== Request Loading ====================

func loadRequests(path string) ([]models.HTTPRequest, string, error) {
	// Try as .http file first
	if strings.HasSuffix(path, ".http") {
		return loadHTTPFileRequests(path)
	}

	// Try as GitStore collection name
	home, _ := os.UserHomeDir()
	store := storage.NewGitStore(filepath.Join(home, ".gopost"))
	requests, err := store.GetRequests(path)
	if err == nil && len(requests) > 0 {
		col, _ := store.GetCollection(path)
		name := path
		if col != nil {
			name = col.Name
		}
		return requests, name, nil
	}

	return nil, "", fmt.Errorf("no requests found at %q (not a collection name or .http file)", path)
}

func loadHTTPFileRequests(path string) ([]models.HTTPRequest, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, "", fmt.Errorf("failed to open .http file: %w", err)
	}
	defer f.Close()

	parsed, err := parser.ParseHTTPFile(f)
	if err != nil {
		return nil, "", fmt.Errorf("failed to parse .http file: %w", err)
	}
	if len(parsed) == 0 {
		return nil, "", fmt.Errorf("no requests found in %q", path)
	}

	requests := make([]models.HTTPRequest, 0, len(parsed))
	for _, pr := range parsed {
		name := pr.Name
		if name == "" {
			name = pr.Method + " " + pr.URL
		}
		requests = append(requests, models.HTTPRequest{
			ID:      name,
			Name:    name,
			Method:  pr.Method,
			URL:     pr.URL,
			Headers: pr.Headers,
			Body:    pr.Body,
		})
	}

	base := filepath.Base(path)
	return requests, base, nil
}

// ==================== Execution ====================

func runSequential(requests []models.HTTPRequest, cfg Config, exec *HTTPExecutor) []RequestResult {
	results := make([]RequestResult, 0, len(requests))
	for _, req := range requests {
		rr := executeOne(req, cfg, exec)
		results = append(results, rr)
		if !rr.Passed && cfg.StopOnFail {
			break
		}
	}
	return results
}

func runParallel(requests []models.HTTPRequest, cfg Config, exec *HTTPExecutor) []RequestResult {
	n := cfg.Parallel
	if n > len(requests) {
		n = len(requests)
	}

	type job struct {
		idx int
		req models.HTTPRequest
	}

	jobs := make(chan job, len(requests))
	results := make([]RequestResult, len(requests))

	var wg sync.WaitGroup
	wg.Add(n)

	// Workers
	for range n {
		go func() {
			defer wg.Done()
			for j := range jobs {
				results[j.idx] = executeOne(j.req, cfg, exec)
			}
		}()
	}

	// Feed jobs
	for i, req := range requests {
		jobs <- job{idx: i, req: req}
	}
	close(jobs)
	wg.Wait()

	return results
}

func executeOne(req models.HTTPRequest, cfg Config, exec *HTTPExecutor) RequestResult {
	status, statusText, body, duration, err := exec.Execute(&req, cfg.Environment)

	rr := RequestResult{
		Name:     req.Name,
		Method:   req.Method,
		URL:      req.URL,
		Status:   status,
		Duration: duration,
		Passed:   err == nil && status >= 200 && status < 400,
	}

	if err != nil {
		rr.Error = err.Error()
		return rr
	}

	// Check X-Expected-Status header
	expectedStatus := req.Headers["X-Expected-Status"]
	if expectedStatus != "" {
		statusStr := fmt.Sprintf("%d", status)
		if statusStr != expectedStatus {
			rr.Passed = false
			rr.Error = fmt.Sprintf("expected status %s, got %d", expectedStatus, status)
		}
	}

	_ = statusText
	_ = body
	return rr
}

// ==================== Variable Substitution ====================

func substituteVariables(s string, env *models.Environment) string {
	if env == nil || len(env.Variables) == 0 {
		return s
	}
	result := s
	for k, v := range env.Variables {
		placeholder := "{{" + k + "}}"
		result = strings.ReplaceAll(result, placeholder, fmt.Sprintf("%v", v))
	}
	return result
}

// applyAuth applies authentication headers from the request's auth config.
func applyAuth(req *http.Request, auth *models.RequestAuth, env *models.Environment) {
	token := substituteVariables(auth.Token, env)
	switch auth.Type {
	case "bearer":
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
	case "basic":
		username := substituteVariables(auth.Username, env)
		password := substituteVariables(auth.Password, env)
		if username != "" || password != "" {
			req.SetBasicAuth(username, password)
		}
	}
}
