package scripting

import (
	"fmt"
	"strconv"

	"go.starlark.net/starlark"
	"go.starlark.net/starlarkjson"
	"go.starlark.net/starlarkstruct"
	"go.starlark.net/syntax"

	"gopost/app/pkg/models"
)

// mutableStruct is a Starlark value that behaves like a struct but allows
// field assignment via SetField (unlike starlarkstruct.Struct which is read-only).
type mutableStruct struct {
	name   string
	fields starlark.StringDict
}

var _ starlark.Value = (*mutableStruct)(nil)
var _ starlark.HasAttrs = (*mutableStruct)(nil)
var _ starlark.HasSetField = (*mutableStruct)(nil)

func newMutableStruct(name string, fields starlark.StringDict) *mutableStruct {
	return &mutableStruct{name: name, fields: fields}
}

func (m *mutableStruct) String() string        { return fmt.Sprintf("<%s>", m.name) }
func (m *mutableStruct) Type() string          { return m.name }
func (m *mutableStruct) Freeze()               {} // mutable by design
func (m *mutableStruct) Truth() starlark.Bool  { return true }
func (m *mutableStruct) Hash() (uint32, error) { return 0, fmt.Errorf("%s is not hashable", m.name) }

func (m *mutableStruct) Attr(name string) (starlark.Value, error) {
	if v, ok := m.fields[name]; ok {
		return v, nil
	}
	return nil, starlark.NoSuchAttrError(fmt.Sprintf("%s has no .%s field", m.name, name))
}

func (m *mutableStruct) AttrNames() []string {
	names := make([]string, 0, len(m.fields))
	for k := range m.fields {
		names = append(names, k)
	}
	return names
}

func (m *mutableStruct) SetField(name string, val starlark.Value) error {
	m.fields[name] = val
	return nil
}

// requestToStarlark converts an HTTPRequest to a mutable Starlark struct.
func requestToStarlark(req *models.HTTPRequest) starlark.Value {
	headers := starlark.NewDict(len(req.Headers))
	for k, v := range req.Headers {
		setDict(headers, k, starlark.String(v))
	}

	return newMutableStruct("request", starlark.StringDict{
		"method":  starlark.String(req.Method),
		"url":     starlark.String(req.URL),
		"body":    starlark.String(req.Body),
		"headers": headers,
	})
}

// starlarkToRequest reads a Starlark value back into an HTTPRequest.
func starlarkToRequest(req *models.HTTPRequest, val starlark.Value) {
	// Helper to get a field from either mutableStruct, struct, or dict
	get := func(key string) (starlark.Value, bool) {
		switch v := val.(type) {
		case *mutableStruct:
			attr, err := v.Attr(key)
			return attr, err == nil
		case *starlarkstruct.Struct:
			attr, err := v.Attr(key)
			return attr, err == nil
		case *starlark.Dict:
			attr, found, _ := v.Get(starlark.String(key))
			return attr, found
		default:
			return nil, false
		}
	}

	if v, found := get("method"); found {
		if s, ok := starlark.AsString(v); ok {
			req.Method = s
		}
	}
	if v, found := get("url"); found {
		if s, ok := starlark.AsString(v); ok {
			req.URL = s
		}
	}
	if v, found := get("body"); found {
		if s, ok := starlark.AsString(v); ok {
			req.Body = s
		}
	}

	// Headers
	if headersVal, found := get("headers"); found {
		switch headers := headersVal.(type) {
		case *starlark.Dict:
			for _, item := range headers.Items() {
				key, _ := starlark.AsString(item[0])
				valStr, _ := starlark.AsString(item[1])
				if req.Headers == nil {
					req.Headers = make(map[string]string)
				}
				req.Headers[key] = valStr
			}
		case *starlarkstruct.Struct:
			for _, name := range headers.AttrNames() {
				attr, _ := headers.Attr(name)
				valStr, _ := starlark.AsString(attr)
				if req.Headers == nil {
					req.Headers = make(map[string]string)
				}
				req.Headers[name] = valStr
			}
		case *mutableStruct:
			for _, name := range headers.AttrNames() {
				attr, _ := headers.Attr(name)
				valStr, _ := starlark.AsString(attr)
				if req.Headers == nil {
					req.Headers = make(map[string]string)
				}
				req.Headers[name] = valStr
			}
		}
	}
}

// responseToStarlark converts a response map to a Starlark struct.
func responseToStarlark(resp map[string]interface{}) starlark.Value {
	code := 0
	if v, ok := resp["code"]; ok {
		code, _ = toInt(v)
	}
	if v, ok := resp["status"]; ok && code == 0 {
		code, _ = toInt(v)
	}

	body := ""
	if v, ok := resp["body"]; ok {
		body, _ = v.(string)
	}

	timeMs := int64(0)
	if v, ok := resp["time"]; ok {
		timeMs, _ = toInt64(v)
	}

	headers := starlark.NewDict(0)
	if h, ok := resp["headers"].(map[string]string); ok {
		headers = starlark.NewDict(len(h))
		for k, v := range h {
			setDict(headers, k, starlark.String(v))
		}
	}

	sdict := starlark.StringDict{
		"status":  starlark.MakeInt(code),
		"body":    starlark.String(body),
		"time":    starlark.MakeInt64(timeMs),
		"headers": headers,
	}

	// response.json() builtin
	sdict["json"] = starlark.NewBuiltin("response.json", func(
		thread *starlark.Thread,
		fn *starlark.Builtin,
		args starlark.Tuple,
		kwargs []starlark.Tuple,
	) (starlark.Value, error) {
		if err := starlark.UnpackArgs(fn.Name(), args, kwargs); err != nil {
			return nil, err
		}
		return parseJSON(body)
	})

	return starlarkstruct.FromStringDict(starlarkstruct.Default, sdict)
}

// envToStarlark converts env vars map to a Starlark dict.
func envToStarlark(env map[string]string) *starlark.Dict {
	dict := starlark.NewDict(len(env))
	for k, v := range env {
		setDict(dict, k, starlark.String(v))
	}
	return dict
}

// starlarkToEnv reads env modifications back from Starlark.
func starlarkToEnv(val starlark.Value, env map[string]string) {
	dict, ok := val.(*starlark.Dict)
	if !ok {
		return
	}
	for _, item := range dict.Items() {
		key, _ := starlark.AsString(item[0])
		val, _ := starlark.AsString(item[1])
		env[key] = val
	}
}

// parseJSON attempts to parse a JSON string into a Starlark value.
func parseJSON(jsonStr string) (starlark.Value, error) {
	thread := &starlark.Thread{Name: "json-parse"}
	globals := starlark.StringDict{
		"src":  starlark.String(jsonStr),
		"json": starlarkjson.Module,
	}
	result, err := starlark.Eval(thread, "json_parse", `json.decode(src)`, globals)
	if err != nil {
		return starlark.String(jsonStr), nil
	}
	return result, nil
}

// --- Helpers ---

func setDict(dict *starlark.Dict, key string, val starlark.Value) {
	_ = dict.SetKey(starlark.String(key), val)
}

func getDictString(dict *starlark.Dict, key string) (string, bool) {
	val, found, _ := dict.Get(starlark.String(key))
	if !found {
		return "", false
	}
	s, ok := starlark.AsString(val)
	return s, ok
}

func getDictInt(dict *starlark.Dict, key string) (int, bool) {
	val, found, _ := dict.Get(starlark.String(key))
	if !found {
		return 0, false
	}
	switch v := val.(type) {
	case starlark.Int:
		i, err := starlark.AsInt32(v)
		return i, err == nil
	default:
		s, _ := starlark.AsString(val)
		i, err := strconv.Atoi(s)
		return i, err == nil
	}
}

// getStructInt reads an int attribute from a struct-like value.
func getStructInt(val starlark.Value, key string) (int, bool) {
	switch v := val.(type) {
	case *starlarkstruct.Struct:
		attr, err := v.Attr(key)
		if err != nil {
			return 0, false
		}
		switch a := attr.(type) {
		case starlark.Int:
			i, err := starlark.AsInt32(a)
			return i, err == nil
		default:
			return 0, false
		}
	case *mutableStruct:
		attr, err := v.Attr(key)
		if err != nil {
			return 0, false
		}
		switch a := attr.(type) {
		case starlark.Int:
			i, err := starlark.AsInt32(a)
			return i, err == nil
		default:
			return 0, false
		}
	case *starlark.Dict:
		return getDictInt(v, key)
	default:
		return 0, false
	}
}

// getStructString reads a string attribute from a struct-like value.
func getStructString(val starlark.Value, key string) (string, bool) {
	switch v := val.(type) {
	case *starlarkstruct.Struct:
		attr, err := v.Attr(key)
		if err != nil {
			return "", false
		}
		return starlark.AsString(attr)
	case *mutableStruct:
		attr, err := v.Attr(key)
		if err != nil {
			return "", false
		}
		return starlark.AsString(attr)
	case *starlark.Dict:
		return getDictString(v, key)
	default:
		return "", false
	}
}

// getStructChild gets a child value from a struct-like value by key.
func getStructChild(val starlark.Value, key string) (starlark.Value, bool) {
	switch v := val.(type) {
	case *starlarkstruct.Struct:
		attr, err := v.Attr(key)
		if err != nil {
			return nil, false
		}
		return attr, true
	case *mutableStruct:
		attr, err := v.Attr(key)
		if err != nil {
			return nil, false
		}
		return attr, true
	case *starlark.Dict:
		child, found, _ := v.Get(starlark.String(key))
		return child, found
	default:
		return nil, false
	}
}

func toInt(v interface{}) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	case string:
		i, err := strconv.Atoi(n)
		return i, err == nil
	default:
		return 0, false
	}
}

func toInt64(v interface{}) (int64, bool) {
	switch n := v.(type) {
	case int64:
		return n, true
	case int:
		return int64(n), true
	case float64:
		return int64(n), true
	default:
		return 0, false
	}
}

func starlarkStringDict(m map[string]interface{}) starlark.StringDict {
	dict := make(starlark.StringDict, len(m))
	for k, v := range m {
		dict[k] = toStarlarkValue(v)
	}
	return dict
}

func toStarlarkValue(v interface{}) starlark.Value {
	switch val := v.(type) {
	case string:
		return starlark.String(val)
	case int:
		return starlark.MakeInt(val)
	case int64:
		return starlark.MakeInt64(val)
	case float64:
		return starlark.Float(val)
	case bool:
		return starlark.Bool(val)
	case []interface{}:
		list := make([]starlark.Value, len(val))
		for i, item := range val {
			list[i] = toStarlarkValue(item)
		}
		return starlark.NewList(list)
	case map[string]interface{}:
		dict := starlark.NewDict(len(val))
		for k, item := range val {
			setDict(dict, k, toStarlarkValue(item))
		}
		return dict
	default:
		return starlark.String(fmt.Sprintf("%v", v))
	}
}

var _ = syntax.LegacyFileOptions
