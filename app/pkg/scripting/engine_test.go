package scripting

import (
	"testing"

	"gopost/app/pkg/models"
)

func TestPreRequestScript(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{
		ID:      "test-1",
		Method:  "GET",
		URL:     "https://api.example.com/data",
		Headers: map[string]string{"Accept": "application/json"},
		Body:    "",
	}

	// Script that modifies headers and body
	script := `
request.headers["Authorization"] = "Bearer token123"
request.headers["X-Custom"] = "hello"
request.body = '{"key": "value"}'
`

	modified, err := engine.PreRequestScript(script, req, nil)
	if err != nil {
		t.Fatalf("PreRequestScript failed: %v", err)
	}

	if modified.Headers["Authorization"] != "Bearer token123" {
		t.Errorf("Expected Authorization header 'Bearer token123', got '%s'", modified.Headers["Authorization"])
	}
	if modified.Headers["X-Custom"] != "hello" {
		t.Errorf("Expected X-Custom header 'hello', got '%s'", modified.Headers["X-Custom"])
	}
	if modified.Body != `{"key": "value"}` {
		t.Errorf("Expected body '{\"key\": \"value\"}', got '%s'", modified.Body)
	}
}

func TestPreRequestScriptEmpty(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{
		ID:     "test-2",
		Method: "POST",
		URL:    "https://api.example.com/create",
		Body:   "original",
	}

	modified, err := engine.PreRequestScript("", req, nil)
	if err != nil {
		t.Fatalf("PreRequestScript with empty script should not error: %v", err)
	}
	if modified.Body != "original" {
		t.Errorf("Empty script should not modify body, got '%s'", modified.Body)
	}

	modified2, err := engine.PreRequestScript("", nil, nil)
	if err != nil {
		t.Fatalf("PreRequestScript with nil request should not error: %v", err)
	}
	if modified2 != nil {
		t.Error("PreRequestScript with nil request should return nil")
	}
}

func TestTestScriptPassing(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{
		ID:     "test-3",
		Method: "GET",
		URL:    "https://api.example.com/users",
	}

	resp := map[string]interface{}{
		"status":  200,
		"code":    200,
		"body":    `{"users": [{"id": 1, "name": "John"}]}`,
		"time":    int64(150),
		"headers": map[string]string{"content-type": "application/json"},
	}

	script := `
assert.status(expected=200)
assert.header(name="content-type", expected="application/json")
assert.body_contains(expected="John")
assert.response_time_less_than(max_ms=1000)
`

	result := engine.TestScript(script, req, resp, nil)
	if !result.Passed {
		t.Errorf("Expected test to pass, got error: %s", result.Error)
	}
}

func TestTestScriptFailing(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{
		ID:     "test-4",
		Method: "GET",
		URL:    "https://api.example.com/users",
	}

	resp := map[string]interface{}{
		"status":  404,
		"code":    404,
		"body":    `{"error": "not found"}`,
		"time":    int64(250),
		"headers": map[string]string{"content-type": "application/json"},
	}

	script := `assert.status(expected=200)`

	result := engine.TestScript(script, req, resp, nil)
	if result.Passed {
		t.Error("Expected test to fail, but it passed")
	}
	if result.Error == "" {
		t.Error("Expected error message, got empty")
	}
	if len(result.Failures) == 0 {
		t.Error("Expected failures list, got empty")
	}
}

func TestTestScriptEmpty(t *testing.T) {
	engine := NewEngine()

	result := engine.TestScript("", nil, nil, nil)
	if !result.Passed {
		t.Errorf("Empty test script should pass, got error: %s", result.Error)
	}
}

func TestTestScriptJSONPath(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{
		ID:     "test-5",
		Method: "GET",
		URL:    "https://api.example.com/users",
	}

	resp := map[string]interface{}{
		"status":  200,
		"code":    200,
		"body":    `{"users": [{"id": 1, "name": "John"}]}`,
		"time":    int64(100),
		"headers": map[string]string{"content-type": "application/json"},
	}

	script := `assert.json_path(path="$.users[0].name", expected="John")`

	result := engine.TestScript(script, req, resp, nil)
	if !result.Passed {
		t.Errorf("Expected json_path assertion to pass, got: %s", result.Error)
	}
}

func TestTestScriptEnvExtraction(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{
		ID:     "test-6",
		Method: "GET",
		URL:    "https://api.example.com/users",
	}

	resp := map[string]interface{}{
		"status":  200,
		"code":    200,
		"body":    `{"token": "abc123"}`,
		"time":    int64(50),
		"headers": map[string]string{},
	}

	env := make(map[string]string)
	script := `env["token"] = "abc123"`

	result := engine.TestScript(script, req, resp, env)
	if !result.Passed {
		t.Fatalf("Expected script to pass, got: %s", result.Error)
	}
	if env["token"] != "abc123" {
		t.Errorf("Expected env[token]='abc123', got '%s'", env["token"])
	}
}

func TestTestScriptTimeout(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{
		ID:     "test-7",
		Method: "GET",
		URL:    "https://api.example.com/slow",
	}

	resp := map[string]interface{}{
		"status": 200,
		"code":   200,
		"body":   "ok",
		"time":   int64(0),
	}

	// Infinite loop should be caught by timeout
	script := `while True: pass`

	result := engine.TestScript(script, req, resp, nil)
	if result.Passed {
		t.Error("Expected timeout error, but script passed")
	}
}

func TestUUIDBuiltin(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{
		ID:      "test-8",
		Method:  "GET",
		URL:     "https://api.example.com/data",
		Headers: map[string]string{},
		Body:    "",
	}

	script := `
id = str(uuid.generate())
request.headers["X-Request-ID"] = id
`

	modified, err := engine.PreRequestScript(script, req, nil)
	if err != nil {
		t.Fatalf("UUID script failed: %v", err)
	}
	if modified.Headers["X-Request-ID"] == "" {
		t.Error("Expected X-Request-ID to be set to a UUID")
	}
}

func TestBase64Builtin(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{
		ID:  "test-9",
		URL: "https://api.example.com/auth",
	}

	resp := map[string]interface{}{
		"status": 200,
		"code":   200,
		"body":   "dXNlcjpwYXNz",
		"time":   int64(10),
	}

	script := `
# Test that the base64 module is available
encoded = base64.encode(s="hello")
assert.ok(condition=encoded == "aGVsbG8=")
`

	result := engine.TestScript(script, req, resp, nil)
	if !result.Passed {
		t.Errorf("Base64 test failed: %s", result.Error)
	}
}

func TestAssertOK(t *testing.T) {
	engine := NewEngine()

	req := &models.HTTPRequest{ID: "test-10"}
	resp := map[string]interface{}{
		"status": 200,
		"code":   200,
		"body":   "ok",
		"time":   int64(5),
	}

	// Passing condition
	result := engine.TestScript(`assert.ok(condition=True)`, req, resp, nil)
	if !result.Passed {
		t.Errorf("assert.ok(True) should pass")
	}

	// Failing condition
	result = engine.TestScript(`assert.ok(condition=False)`, req, resp, nil)
	if result.Passed {
		t.Error("assert.ok(False) should fail")
	}
}
