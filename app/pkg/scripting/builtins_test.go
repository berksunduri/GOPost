package scripting

import (
	"testing"

	"gopost/app/pkg/models"
	"go.starlark.net/starlark"
)

func TestBuiltins_HMACBase64Now(t *testing.T) {
	engine := NewEngine()
	req := &models.HTTPRequest{ID: "b1", Method: "GET", URL: "https://example.com"}
	resp := map[string]interface{}{
		"status":  200,
		"code":    200,
		"body":    "ok",
		"time":    int64(10),
		"headers": map[string]string{"X-A": "1"},
	}

	script := `
encoded = base64.encode(s="user:pass")
decoded = base64.decode(s=encoded)
assert.ok(condition=decoded == "user:pass")

mac = hmac.sha256(secret="s", message="m")
assert.ok(condition=len(mac) == 64)
mac1 = hmac.sha1(secret="s", message="m")
assert.ok(condition=len(mac1) == 40)
mac5 = hmac.md5(secret="s", message="m")
assert.ok(condition=len(mac5) == 32)

u = now.unix()
assert.ok(condition=u > 0)
iso = now.iso()
assert.ok(condition=len(iso) > 10)

assert.header(name="x-a", expected="1")
`

	result := engine.TestScript(script, req, resp, nil)
	if !result.Passed {
		t.Fatalf("builtins script failed: %s", result.Error)
	}
}

func TestInjectGlobals(t *testing.T) {
	engine := NewEngine()
	engine.InjectGlobals(starlark.StringDict{
		"answer": starlark.MakeInt(42),
	})
	req := &models.HTTPRequest{ID: "b2", Headers: map[string]string{}}
	modified, err := engine.PreRequestScript(`request.headers["A"] = str(answer)`, req, nil)
	if err != nil {
		t.Fatalf("pre: %v", err)
	}
	if modified.Headers["A"] != "42" {
		t.Errorf("want 42, got %q", modified.Headers["A"])
	}
}

func TestConvert_JSONBodyAndDict(t *testing.T) {
	engine := NewEngine()
	req := &models.HTTPRequest{ID: "b3"}
	resp := map[string]interface{}{
		"status":  200,
		"code":    200,
		"body":    `{"n": 7, "s": "hi", "nested": {"x": 1}}`,
		"time":    int64(5),
		"headers": map[string]string{"Content-Type": "application/json"},
	}
	script := `
assert.json_path(path="$.n", expected="7")
assert.json_path(path="$.s", expected="hi")
assert.body_contains(expected="nested")
`
	result := engine.TestScript(script, req, resp, nil)
	if !result.Passed {
		t.Fatalf("convert/json script failed: %s", result.Error)
	}
}
