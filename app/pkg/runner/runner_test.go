package runner

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

// ==================== substituteVariables ====================

func TestSubstituteVariables_NoEnv(t *testing.T) {
	got := substituteVariables("https://{{host}}/api", nil)
	if got != "https://{{host}}/api" {
		t.Errorf("with nil env, want unchanged string, got %q", got)
	}
}

func TestSubstituteVariables_EmptyEnv(t *testing.T) {
	env := &models.Environment{Variables: map[string]interface{}{}}
	got := substituteVariables("https://{{host}}/api", env)
	if got != "https://{{host}}/api" {
		t.Errorf("with empty env, want unchanged string, got %q", got)
	}
}

func TestSubstituteVariables_SingleVar(t *testing.T) {
	env := &models.Environment{Variables: map[string]interface{}{"host": "api.example.com"}}
	got := substituteVariables("https://{{host}}/users", env)
	want := "https://api.example.com/users"
	if got != want {
		t.Errorf("want %q, got %q", want, got)
	}
}

func TestSubstituteVariables_MultipleVars(t *testing.T) {
	env := &models.Environment{Variables: map[string]interface{}{
		"base": "https://api.example.com",
		"ver":  "v2",
	}}
	got := substituteVariables("{{base}}/{{ver}}/items", env)
	want := "https://api.example.com/v2/items"
	if got != want {
		t.Errorf("want %q, got %q", want, got)
	}
}

func TestSubstituteVariables_NumericValue(t *testing.T) {
	env := &models.Environment{Variables: map[string]interface{}{"id": 42}}
	got := substituteVariables("/items/{{id}}", env)
	if got != "/items/42" {
		t.Errorf("want /items/42, got %q", got)
	}
}

func TestSubstituteVariables_NoPlaceholders(t *testing.T) {
	env := &models.Environment{Variables: map[string]interface{}{"foo": "bar"}}
	got := substituteVariables("plain string", env)
	if got != "plain string" {
		t.Errorf("want unchanged, got %q", got)
	}
}

// ==================== Result.ExitCode ====================

func TestExitCode_AllPassed(t *testing.T) {
	r := &Result{Passed: 3, Failed: 0}
	if r.ExitCode() != 0 {
		t.Error("all passed: want exit code 0")
	}
}

func TestExitCode_SomeFailed(t *testing.T) {
	r := &Result{Passed: 2, Failed: 1}
	if r.ExitCode() != 1 {
		t.Error("some failed: want exit code 1")
	}
}

func TestExitCode_AllFailed(t *testing.T) {
	r := &Result{Passed: 0, Failed: 5}
	if r.ExitCode() != 1 {
		t.Error("all failed: want exit code 1")
	}
}

// ==================== executeOne (with httptest server) ====================

func newTestExecutor(server *httptest.Server) *HTTPExecutor {
	return &HTTPExecutor{
		Client: &http.Client{Timeout: 5 * time.Second},
	}
}

func TestExecuteOne_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"ok":true}`)
	}))
	defer srv.Close()

	req := models.HTTPRequest{
		ID:      "t1",
		Name:    "Health",
		Method:  "GET",
		URL:     srv.URL + "/health",
		Headers: map[string]string{},
	}
	cfg := Config{Timeout: 5 * time.Second}
	exec := newTestExecutor(srv)

	rr := executeOne(req, cfg, exec)
	if !rr.Passed {
		t.Errorf("want Passed=true, got error=%s", rr.Error)
	}
	if rr.Status != 200 {
		t.Errorf("want status 200, got %d", rr.Status)
	}
}

func TestExecuteOne_404Fails(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	req := models.HTTPRequest{
		ID:      "t2",
		Name:    "Missing",
		Method:  "GET",
		URL:     srv.URL + "/missing",
		Headers: map[string]string{},
	}
	cfg := Config{Timeout: 5 * time.Second}
	exec := newTestExecutor(srv)

	rr := executeOne(req, cfg, exec)
	if rr.Passed {
		t.Error("404 should not pass")
	}
}

func TestExecuteOne_XExpectedStatus_Match(t *testing.T) {
	// X-Expected-Status only overrides to false on mismatch; a matching 2xx still passes.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := models.HTTPRequest{
		ID:      "t3",
		Name:    "Expected 200",
		Method:  "GET",
		URL:     srv.URL + "/health",
		Headers: map[string]string{"X-Expected-Status": "200"},
	}
	cfg := Config{Timeout: 5 * time.Second}
	exec := newTestExecutor(srv)

	rr := executeOne(req, cfg, exec)
	if !rr.Passed {
		t.Errorf("X-Expected-Status=200 with 200 response should pass, got error=%s", rr.Error)
	}
}

func TestExecuteOne_XExpectedStatus_Mismatch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := models.HTTPRequest{
		ID:      "t4",
		Name:    "Expects 201",
		Method:  "POST",
		URL:     srv.URL + "/items",
		Headers: map[string]string{"X-Expected-Status": "201"},
	}
	cfg := Config{Timeout: 5 * time.Second}
	exec := newTestExecutor(srv)

	rr := executeOne(req, cfg, exec)
	if rr.Passed {
		t.Error("expected status mismatch (want 201, got 200) should not pass")
	}
}

func TestExecuteOne_VariableSubstitution(t *testing.T) {
	var capturedPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	env := &models.Environment{Variables: map[string]interface{}{"id": "99"}}
	req := models.HTTPRequest{
		ID:      "t5",
		Name:    "Get by ID",
		Method:  "GET",
		URL:     srv.URL + "/items/{{id}}",
		Headers: map[string]string{},
	}
	cfg := Config{Timeout: 5 * time.Second, Environment: env}
	exec := newTestExecutor(srv)

	rr := executeOne(req, cfg, exec)
	if !rr.Passed {
		t.Errorf("request with variable substitution failed: %s", rr.Error)
	}
	if capturedPath != "/items/99" {
		t.Errorf("path: want /items/99, got %s", capturedPath)
	}
}

func TestExecuteOne_HeadersSent(t *testing.T) {
	var capturedAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	req := models.HTTPRequest{
		ID:      "t6",
		Name:    "Auth check",
		Method:  "GET",
		URL:     srv.URL + "/secure",
		Headers: map[string]string{"Authorization": "Bearer mytoken"},
	}
	cfg := Config{Timeout: 5 * time.Second}
	exec := newTestExecutor(srv)

	executeOne(req, cfg, exec)
	if capturedAuth != "Bearer mytoken" {
		t.Errorf("Authorization header: want 'Bearer mytoken', got %q", capturedAuth)
	}
}

// ==================== runSequential ====================

func TestRunSequential_StopOnFail(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		if r.URL.Path == "/fail" {
			w.WriteHeader(http.StatusInternalServerError)
		} else {
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	requests := []models.HTTPRequest{
		{ID: "r1", Name: "OK", Method: "GET", URL: srv.URL + "/ok", Headers: map[string]string{}},
		{ID: "r2", Name: "FAIL", Method: "GET", URL: srv.URL + "/fail", Headers: map[string]string{}},
		{ID: "r3", Name: "AFTER", Method: "GET", URL: srv.URL + "/ok", Headers: map[string]string{}},
	}
	cfg := Config{StopOnFail: true, Timeout: 5 * time.Second}
	exec := &HTTPExecutor{Client: &http.Client{Timeout: 5 * time.Second}}

	results := runSequential(requests, cfg, exec)
	if len(results) != 2 {
		t.Errorf("StopOnFail: want 2 results (stopped after fail), got %d", len(results))
	}
	if results[1].Passed {
		t.Error("second result (fail) should not pass")
	}
}

func TestRunSequential_ContinueOnFail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/fail" {
			w.WriteHeader(http.StatusInternalServerError)
		} else {
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer srv.Close()

	requests := []models.HTTPRequest{
		{ID: "r1", Name: "OK", Method: "GET", URL: srv.URL + "/ok", Headers: map[string]string{}},
		{ID: "r2", Name: "FAIL", Method: "GET", URL: srv.URL + "/fail", Headers: map[string]string{}},
		{ID: "r3", Name: "AFTER", Method: "GET", URL: srv.URL + "/ok", Headers: map[string]string{}},
	}
	cfg := Config{StopOnFail: false, Timeout: 5 * time.Second}
	exec := &HTTPExecutor{Client: &http.Client{Timeout: 5 * time.Second}}

	results := runSequential(requests, cfg, exec)
	if len(results) != 3 {
		t.Errorf("ContinueOnFail: want 3 results, got %d", len(results))
	}
}

// ==================== applyAuth ====================

func TestApplyAuth_Bearer(t *testing.T) {
	httpReq, _ := http.NewRequest("GET", "https://example.com", nil)
	auth := &models.RequestAuth{Type: "bearer", Token: "mytoken"}
	applyAuth(httpReq, auth, nil)
	got := httpReq.Header.Get("Authorization")
	if got != "Bearer mytoken" {
		t.Errorf("Authorization: want 'Bearer mytoken', got %q", got)
	}
}

func TestApplyAuth_Basic(t *testing.T) {
	httpReq, _ := http.NewRequest("GET", "https://example.com", nil)
	auth := &models.RequestAuth{Type: "basic", Username: "user", Password: "pass"}
	applyAuth(httpReq, auth, nil)
	u, p, ok := httpReq.BasicAuth()
	if !ok {
		t.Fatal("basic auth should be set")
	}
	if u != "user" || p != "pass" {
		t.Errorf("basic auth: want user/pass, got %s/%s", u, p)
	}
}

func TestApplyAuth_None(t *testing.T) {
	httpReq, _ := http.NewRequest("GET", "https://example.com", nil)
	auth := &models.RequestAuth{Type: "none"}
	applyAuth(httpReq, auth, nil)
	if got := httpReq.Header.Get("Authorization"); got != "" {
		t.Errorf("none auth: want no Authorization header, got %q", got)
	}
}

func TestApplyAuth_BearerWithEnvVar(t *testing.T) {
	httpReq, _ := http.NewRequest("GET", "https://example.com", nil)
	env := &models.Environment{Variables: map[string]interface{}{"tok": "secret"}}
	auth := &models.RequestAuth{Type: "bearer", Token: "{{tok}}"}
	applyAuth(httpReq, auth, env)
	got := httpReq.Header.Get("Authorization")
	if got != "Bearer secret" {
		t.Errorf("bearer with env var: want 'Bearer secret', got %q", got)
	}
}

func TestApplyAuth_EmptyBearer(t *testing.T) {
	httpReq, _ := http.NewRequest("GET", "https://example.com", nil)
	auth := &models.RequestAuth{Type: "bearer", Token: ""}
	applyAuth(httpReq, auth, nil)
	if got := httpReq.Header.Get("Authorization"); got != "" {
		t.Errorf("empty bearer should not set Authorization, got %q", got)
	}
}

func TestApplyAuth_APIKeyHeader(t *testing.T) {
	httpReq, _ := http.NewRequest("GET", "https://example.com", nil)
	auth := &models.RequestAuth{Type: "api_key", APIKey: "X-Key", APIKeyValue: "secret", APIKeyIn: "header"}
	applyAuth(httpReq, auth, nil)
	if httpReq.Header.Get("X-Key") != "secret" {
		t.Fatalf("got %q", httpReq.Header.Get("X-Key"))
	}
}

func TestApplyAuth_APIKeyQuery(t *testing.T) {
	httpReq, _ := http.NewRequest("GET", "https://example.com/path", nil)
	auth := &models.RequestAuth{Type: "api_key", APIKey: "token", APIKeyValue: "abc", APIKeyIn: "query"}
	applyAuth(httpReq, auth, nil)
	if httpReq.URL.Query().Get("token") != "abc" {
		t.Fatalf("query=%q", httpReq.URL.RawQuery)
	}
}
