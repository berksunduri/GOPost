package scripting

import (
	"context"
	"fmt"
	"time"

	"go.starlark.net/starlark"
	"go.starlark.net/starlarkjson"

	"gopost/app/pkg/models"
)

// Engine is a Starlark scripting engine for pre-request and test scripts.
type Engine struct {
	globals starlark.StringDict
}

// NewEngine creates a new scripting engine with built-in modules pre-registered.
func NewEngine() *Engine {
	return &Engine{
		globals: starlark.StringDict{
			"json":   starlarkjson.Module,
			"base64": base64Module(),
			"hmac":   hmacModule(),
			"uuid":   uuidModule(),
			"now":    nowModule(),
			"assert": assertModule(),
		},
	}
}

// TestResult holds the outcome of running a test script.
type TestResult struct {
	Passed     bool     `json:"passed"`
	Error      string   `json:"error,omitempty"`
	Failures   []string `json:"failures,omitempty"`
	DurationMs int64    `json:"duration_ms"`
}

// PreRequestScript runs a pre-request script. The script can modify the request
// object (method, url, headers, body). Returns the (possibly modified) request.
func (e *Engine) PreRequestScript(script string, req *models.HTTPRequest, env map[string]string) (*models.HTTPRequest, error) {
	if script == "" || req == nil {
		return req, nil
	}

	// Build a copy of globals with request and env bound
	globals := e.buildGlobals()
	globals["request"] = requestToStarlark(req)
	globals["env"] = envToStarlark(env)

	thread := &starlark.Thread{Name: "pre-request"}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Run in goroutine with timeout
	type result struct {
		val starlark.StringDict
		err error
	}
	ch := make(chan result, 1)
	go func() {
		val, err := starlark.ExecFile(thread, "pre_request.gopost", script, globals)
		ch <- result{val, err}
	}()

	select {
	case r := <-ch:
		if r.err != nil {
			return nil, fmt.Errorf("pre-request script: %w", r.err)
		}
		_ = r.val
	case <-ctx.Done():
		return nil, fmt.Errorf("pre-request script timed out after 5s")
	}

	// Read modifications back from the Starlark request object
	starlarkToRequest(req, globals["request"])

	return req, nil
}

// TestScript runs a test script after an HTTP response. Returns test results
// indicating pass/fail and any assertion error messages.
func (e *Engine) TestScript(script string, req *models.HTTPRequest, resp map[string]interface{}, env map[string]string) *TestResult {
	start := time.Now()

	if script == "" {
		return &TestResult{Passed: true, DurationMs: time.Since(start).Milliseconds()}
	}

	globals := e.buildGlobals()
	globals["request"] = requestToStarlark(req)
	globals["response"] = responseToStarlark(resp)
	globals["env"] = envToStarlark(env)

	thread := &starlark.Thread{Name: "test"}

	// Store response reference on thread for assert builtins
	thread.SetLocal("response", globals["response"])

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	ch := make(chan error, 1)
	go func() {
		_, err := starlark.ExecFile(thread, "test.gopost", script, globals)
		ch <- err
	}()

	var err error
	select {
	case err = <-ch:
	case <-ctx.Done():
		err = fmt.Errorf("test script timed out after 5s")
	}

	duration := time.Since(start).Milliseconds()

	if err != nil {
		return &TestResult{
			Passed:     false,
			Error:      err.Error(),
			Failures:   []string{err.Error()},
			DurationMs: duration,
		}
	}

	// Read env modifications back
	starlarkToEnv(globals["env"], env)

	return &TestResult{
		Passed:     true,
		DurationMs: duration,
	}
}

// InjectGlobals adds custom globals to the engine for script execution.
// This allows the caller to provide additional builtins or variables.
func (e *Engine) InjectGlobals(extra starlark.StringDict) {
	for k, v := range extra {
		e.globals[k] = v
	}
}

// buildGlobals returns a copy of the engine's globals so each execution
// gets a fresh set of mutable values.
func (e *Engine) buildGlobals() starlark.StringDict {
	globals := make(starlark.StringDict, len(e.globals))
	for k, v := range e.globals {
		globals[k] = v
	}
	return globals
}
