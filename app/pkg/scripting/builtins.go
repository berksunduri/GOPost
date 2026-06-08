package scripting

import (
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"hash"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.starlark.net/starlark"
	"go.starlark.net/starlarkjson"
	"go.starlark.net/starlarkstruct"
)

func base64Module() *starlarkstruct.Module {
	return &starlarkstruct.Module{
		Name: "base64",
		Members: starlark.StringDict{
			"encode": starlark.NewBuiltin("base64.encode", func(
				thread *starlark.Thread,
				fn *starlark.Builtin,
				args starlark.Tuple,
				kwargs []starlark.Tuple,
			) (starlark.Value, error) {
				var s string
				if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "s", &s); err != nil {
					return nil, err
				}
				return starlark.String(base64.StdEncoding.EncodeToString([]byte(s))), nil
			}),
			"decode": starlark.NewBuiltin("base64.decode", func(
				thread *starlark.Thread,
				fn *starlark.Builtin,
				args starlark.Tuple,
				kwargs []starlark.Tuple,
			) (starlark.Value, error) {
				var s string
				if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "s", &s); err != nil {
					return nil, err
				}
				dec, err := base64.StdEncoding.DecodeString(s)
				if err != nil {
					return nil, fmt.Errorf("base64.decode: %w", err)
				}
				return starlark.String(dec), nil
			}),
		},
	}
}

func hmacModule() *starlarkstruct.Module {
	return &starlarkstruct.Module{
		Name: "hmac",
		Members: starlark.StringDict{
			"sha256": starlark.NewBuiltin("hmac.sha256", hmacBuiltin(sha256.New)),
			"sha1":   starlark.NewBuiltin("hmac.sha1", hmacBuiltin(sha1.New)),
			"md5":    starlark.NewBuiltin("hmac.md5", hmacBuiltin(md5.New)),
		},
	}
}

func hmacBuiltin(h func() hash.Hash) func(*starlark.Thread, *starlark.Builtin, starlark.Tuple, []starlark.Tuple) (starlark.Value, error) {
	return func(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
		var secret, message string
		if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "secret", &secret, "message", &message); err != nil {
			return nil, err
		}
		mac := hmac.New(h, []byte(secret))
		mac.Write([]byte(message))
		return starlark.String(hex.EncodeToString(mac.Sum(nil))), nil
	}
}

func uuidModule() *starlarkstruct.Module {
	return &starlarkstruct.Module{
		Name: "uuid",
		Members: starlark.StringDict{
			"generate": starlark.NewBuiltin("uuid.generate", func(
				thread *starlark.Thread,
				fn *starlark.Builtin,
				args starlark.Tuple,
				kwargs []starlark.Tuple,
			) (starlark.Value, error) {
				if err := starlark.UnpackArgs(fn.Name(), args, kwargs); err != nil {
					return nil, err
				}
				return starlark.String(uuid.New().String()), nil
			}),
		},
	}
}

func nowModule() *starlarkstruct.Module {
	return &starlarkstruct.Module{
		Name: "now",
		Members: starlark.StringDict{
			"unix": starlark.NewBuiltin("now.unix", func(
				thread *starlark.Thread,
				fn *starlark.Builtin,
				args starlark.Tuple,
				kwargs []starlark.Tuple,
			) (starlark.Value, error) {
				if err := starlark.UnpackArgs(fn.Name(), args, kwargs); err != nil {
					return nil, err
				}
				return starlark.MakeInt64(time.Now().Unix()), nil
			}),
			"iso": starlark.NewBuiltin("now.iso", func(
				thread *starlark.Thread,
				fn *starlark.Builtin,
				args starlark.Tuple,
				kwargs []starlark.Tuple,
			) (starlark.Value, error) {
				if err := starlark.UnpackArgs(fn.Name(), args, kwargs); err != nil {
					return nil, err
				}
				return starlark.String(time.Now().UTC().Format(time.RFC3339)), nil
			}),
		},
	}
}

func assertModule() *starlarkstruct.Module {
	return &starlarkstruct.Module{
		Name: "assert",
		Members: starlark.StringDict{
			"status":                  starlark.NewBuiltin("assert.status", assertStatus),
			"header":                  starlark.NewBuiltin("assert.header", assertHeader),
			"json_path":               starlark.NewBuiltin("assert.json_path", assertJSONPath),
			"body_contains":           starlark.NewBuiltin("assert.body_contains", assertBodyContains),
			"response_time_less_than": starlark.NewBuiltin("assert.response_time_less_than", assertResponseTime),
			"ok":                      starlark.NewBuiltin("assert.ok", assertOK),
		},
	}
}

func getResponseFromThread(thread *starlark.Thread) (starlark.Value, error) {
	respVal, ok := thread.Local("response").(starlark.Value)
	if !ok {
		return nil, fmt.Errorf("response not available in script context")
	}
	return respVal, nil
}

func assertStatus(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var expected int
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "expected", &expected); err != nil {
		return nil, err
	}

	respVal, err := getResponseFromThread(thread)
	if err != nil {
		return nil, fmt.Errorf("assert.status: %w", err)
	}

	actual, ok := getStructInt(respVal, "status")
	if !ok {
		return nil, fmt.Errorf("assert.status: could not read response status")
	}

	if actual != expected {
		return nil, fmt.Errorf("assert.status: expected %d, got %d", expected, actual)
	}
	return starlark.None, nil
}

func assertHeader(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var name, expected string
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "name", &name, "expected", &expected); err != nil {
		return nil, err
	}

	respVal, err := getResponseFromThread(thread)
	if err != nil {
		return nil, fmt.Errorf("assert.header: %w", err)
	}

	headersVal, found := getStructChild(respVal, "headers")
	if !found {
		return nil, fmt.Errorf("assert.header: no headers in response")
	}

	// Headers can be either a dict or a struct
	var actual string
	switch headers := headersVal.(type) {
	case *starlark.Dict:
		actual, found = getDictString(headers, strings.ToLower(name))
		if !found {
			for _, item := range headers.Items() {
				key, _ := starlark.AsString(item[0])
				if strings.EqualFold(key, name) {
					actual, _ = starlark.AsString(item[1])
					found = true
					break
				}
			}
		}
	case *starlarkstruct.Struct:
		for _, attrName := range headers.AttrNames() {
			if strings.EqualFold(attrName, name) {
				a, _ := headers.Attr(attrName)
				actual, _ = starlark.AsString(a)
				found = true
				break
			}
		}
	}

	if !found {
		return nil, fmt.Errorf("assert.header: header '%s' not found in response", name)
	}

	if !strings.Contains(strings.ToLower(actual), strings.ToLower(expected)) {
		return nil, fmt.Errorf("assert.header '%s': expected to contain '%s', got '%s'", name, expected, actual)
	}
	return starlark.None, nil
}

func assertJSONPath(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var path, expected string
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "path", &path, "expected", &expected); err != nil {
		return nil, err
	}

	respVal, err := getResponseFromThread(thread)
	if err != nil {
		return nil, fmt.Errorf("assert.json_path: %w", err)
	}

	body, _ := getStructString(respVal, "body")

	// Use json module to parse body
	globals := starlark.StringDict{
		"src":  starlark.String(body),
		"json": starlarkjson.Module,
	}
	result, err := starlark.Eval(thread, "json_path", `json.decode(src)`, globals)
	if err != nil {
		return nil, fmt.Errorf("assert.json_path: failed to parse response body as JSON: %w", err)
	}

	val := traversePath(result, path)
	if val == nil {
		return nil, fmt.Errorf("assert.json_path: path '%s' not found in response", path)
	}

	actual := fmt.Sprintf("%v", val)
	actual = strings.Trim(actual, `"`)
	if actual != expected {
		return nil, fmt.Errorf("assert.json_path '%s': expected '%s', got '%s'", path, expected, actual)
	}
	return starlark.None, nil
}

func assertBodyContains(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var expected string
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "expected", &expected); err != nil {
		return nil, err
	}

	respVal, err := getResponseFromThread(thread)
	if err != nil {
		return nil, fmt.Errorf("assert.body_contains: %w", err)
	}

	body, _ := getStructString(respVal, "body")
	if !strings.Contains(body, expected) {
		return nil, fmt.Errorf("assert.body_contains: body does not contain '%s'", expected)
	}
	return starlark.None, nil
}

func assertResponseTime(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var maxMs int
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "max_ms", &maxMs); err != nil {
		return nil, err
	}

	respVal, err := getResponseFromThread(thread)
	if err != nil {
		return nil, fmt.Errorf("assert.response_time_less_than: %w", err)
	}

	actual, _ := getStructInt(respVal, "time")
	if actual > maxMs {
		return nil, fmt.Errorf("assert.response_time_less_than: expected < %dms, got %dms", maxMs, actual)
	}
	return starlark.None, nil
}

func assertOK(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var condition bool
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "condition", &condition); err != nil {
		return nil, err
	}
	if !condition {
		return nil, fmt.Errorf("assert.ok: condition is false")
	}
	return starlark.None, nil
}

func traversePath(val starlark.Value, path string) starlark.Value {
	path = strings.TrimPrefix(path, "$.")
	parts := strings.Split(path, ".")

	current := val
	for _, part := range parts {
		idxBracket := strings.Index(part, "[")
		if idxBracket >= 0 {
			key := part[:idxBracket]
			idxStr := part[idxBracket+1:]
			idxStr = strings.TrimSuffix(idxStr, "]")
			idx := 0
			for _, ch := range idxStr {
				if ch >= '0' && ch <= '9' {
					idx = idx*10 + int(ch-'0')
				}
			}

			if dict, ok := current.(*starlark.Dict); ok {
				if v, found, _ := dict.Get(starlark.String(key)); found {
					current = v
				} else {
					return nil
				}
			} else if s, ok := current.(*starlarkstruct.Struct); ok {
				if v, err := s.Attr(key); err == nil {
					current = v
				} else {
					return nil
				}
			} else {
				return nil
			}

			if list, ok := current.(*starlark.List); ok {
				if idx < list.Len() {
					current = list.Index(idx)
				} else {
					return nil
				}
			} else {
				return nil
			}
		} else {
			if dict, ok := current.(*starlark.Dict); ok {
				if v, found, _ := dict.Get(starlark.String(part)); found {
					current = v
				} else {
					return nil
				}
			} else if s, ok := current.(*starlarkstruct.Struct); ok {
				if v, err := s.Attr(part); err == nil {
					current = v
				} else {
					return nil
				}
			} else {
				return nil
			}
		}
	}
	return current
}
