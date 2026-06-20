package runner

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

// newCountServer returns a server that responds with 200 to every request,
// and an atomic counter of requests seen (safe for parallel tests).
func newCountServer(t *testing.T) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var count atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count.Add(1)
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	}))
	t.Cleanup(srv.Close)
	return srv, &count
}

func writeHTTPFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write http file: %v", err)
	}
	return path
}

// ==================== Run() end-to-end ====================

func TestRun_HTTPFile_AllPass(t *testing.T) {
	srv, _ := newCountServer(t)
	dir := t.TempDir()
	path := writeHTTPFile(t, dir, "requests.http", fmt.Sprintf(`
### Get Users
GET %s/users

### Health
GET %s/health
`, srv.URL, srv.URL))

	result, err := Run(Config{
		CollectionPath: path,
		Timeout:        5 * time.Second,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Total != 2 {
		t.Errorf("Total: want 2, got %d", result.Total)
	}
	if result.Passed != 2 {
		t.Errorf("Passed: want 2, got %d", result.Passed)
	}
	if result.Failed != 0 {
		t.Errorf("Failed: want 0, got %d", result.Failed)
	}
	if result.ExitCode() != 0 {
		t.Errorf("ExitCode: want 0")
	}
}

func TestRun_HTTPFile_OneFail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/fail" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dir := t.TempDir()
	path := writeHTTPFile(t, dir, "requests.http", fmt.Sprintf(`
### Good
GET %s/ok

### Bad
GET %s/fail
`, srv.URL, srv.URL))

	result, err := Run(Config{CollectionPath: path, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Passed != 1 {
		t.Errorf("Passed: want 1, got %d", result.Passed)
	}
	if result.Failed != 1 {
		t.Errorf("Failed: want 1, got %d", result.Failed)
	}
	if result.ExitCode() != 1 {
		t.Errorf("ExitCode: want 1")
	}
}

func TestRun_StopOnFail(t *testing.T) {
	var count atomic.Int64
	// Rewrite handler so first request fails
	realSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := count.Add(1)
		if n == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer realSrv.Close()

	dir := t.TempDir()
	path := writeHTTPFile(t, dir, "requests.http", fmt.Sprintf(`
### One
GET %s/a

### Two
GET %s/b

### Three
GET %s/c
`, realSrv.URL, realSrv.URL, realSrv.URL))

	result, err := Run(Config{
		CollectionPath: path,
		StopOnFail:     true,
		Timeout:        5 * time.Second,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Total != 1 {
		t.Errorf("StopOnFail: Total should be 1 (stopped after first fail), got %d", result.Total)
	}
}

func TestRun_WithVariableSubstitution(t *testing.T) {
	srv, count := newCountServer(t)
	dir := t.TempDir()
	path := writeHTTPFile(t, dir, "requests.http", `
### Substituted
GET {{base_url}}/path
`)

	result, err := Run(Config{
		CollectionPath: path,
		Timeout:        5 * time.Second,
		Environment: &models.Environment{
			Variables: map[string]interface{}{"base_url": srv.URL},
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Passed != 1 {
		t.Errorf("Passed: want 1, got %d", result.Passed)
	}
	if count.Load() != 1 {
		t.Errorf("server hit count: want 1, got %d", count.Load())
	}
}

func TestRun_WithParallel(t *testing.T) {
	srv, count := newCountServer(t)
	dir := t.TempDir()
	body := ""
	for i := 0; i < 5; i++ {
		body += fmt.Sprintf("\n### Req%d\nGET %s/%d\n", i, srv.URL, i)
	}
	path := writeHTTPFile(t, dir, "requests.http", body)

	result, err := Run(Config{
		CollectionPath: path,
		Parallel:       3,
		Timeout:        5 * time.Second,
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Total != 5 {
		t.Errorf("Total: want 5, got %d", result.Total)
	}
	if count.Load() != 5 {
		t.Errorf("server hit count: want 5, got %d", count.Load())
	}
}

func TestRun_HTTPFile_NotFound(t *testing.T) {
	_, err := Run(Config{CollectionPath: "/nonexistent/path.http"})
	if err == nil {
		t.Error("Run with nonexistent .http file should return error")
	}
}

func TestRun_HTTPFile_CollectionNameFallback(t *testing.T) {
	// A non-existent collection name (not .http) should return an error
	_, err := Run(Config{CollectionPath: "nonexistent-collection-xyz"})
	if err == nil {
		t.Error("Run with nonexistent collection name should return error")
	}
}

func TestRun_ResultHasCollectionName(t *testing.T) {
	srv, _ := newCountServer(t)
	dir := t.TempDir()
	path := writeHTTPFile(t, dir, "myapi.http", fmt.Sprintf("### R\nGET %s/\n", srv.URL))

	result, err := Run(Config{CollectionPath: path, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.CollectionName != "myapi.http" {
		t.Errorf("CollectionName: want 'myapi.http', got %q", result.CollectionName)
	}
}

func TestRun_RequestResultFields(t *testing.T) {
	srv, _ := newCountServer(t)
	dir := t.TempDir()
	path := writeHTTPFile(t, dir, "requests.http", fmt.Sprintf("### My Request\nGET %s/items\n", srv.URL))

	result, err := Run(Config{CollectionPath: path, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(result.Requests) != 1 {
		t.Fatalf("Requests count: want 1, got %d", len(result.Requests))
	}
	rr := result.Requests[0]
	if rr.Method != "GET" {
		t.Errorf("Method: want 'GET', got %q", rr.Method)
	}
	if rr.Status != 200 {
		t.Errorf("Status: want 200, got %d", rr.Status)
	}
	if !rr.Passed {
		t.Errorf("Passed: want true")
	}
	if rr.Duration < 0 {
		t.Errorf("Duration should be >= 0")
	}
}

func TestRun_Duration(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(20 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dir := t.TempDir()
	path := writeHTTPFile(t, dir, "requests.http", fmt.Sprintf("### R\nGET %s/\n", srv.URL))

	result, err := Run(Config{CollectionPath: path, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result.Duration < 20*time.Millisecond {
		t.Errorf("Duration should be at least 20ms, got %v", result.Duration)
	}
}
