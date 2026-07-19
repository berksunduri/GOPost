package scripting

import (
	"testing"

	"go.starlark.net/starlark"
)

func TestMutableStruct_ValueInterface(t *testing.T) {
	m := newMutableStruct("req", starlark.StringDict{
		"url": starlark.String("https://x"),
	})
	if m.String() == "" || m.Type() != "req" {
		t.Fatalf("string/type: %q %q", m.String(), m.Type())
	}
	m.Freeze()
	if !m.Truth() {
		t.Fatal("Truth should be true")
	}
	if _, err := m.Hash(); err == nil {
		t.Fatal("Hash should fail")
	}
	names := m.AttrNames()
	if len(names) != 1 || names[0] != "url" {
		t.Fatalf("AttrNames: %#v", names)
	}
	v, err := m.Attr("url")
	if err != nil || v.(starlark.String) != "https://x" {
		t.Fatalf("Attr: %v %v", v, err)
	}
	if err := m.SetField("url", starlark.String("https://y")); err != nil {
		t.Fatal(err)
	}
}

func TestToStarlarkValueAndHelpers(t *testing.T) {
	dict := starlarkStringDict(map[string]interface{}{"a": "1", "n": 2})
	if dict["a"] != starlark.String("1") {
		t.Fatalf("dict: %#v", dict)
	}

	val := toStarlarkValue(map[string]interface{}{
		"n":   3,
		"b":   true,
		"s":   "hi",
		"arr": []interface{}{1, "x"},
		"obj": map[string]interface{}{"k": "v"},
	})
	if val == nil || val == starlark.None {
		t.Fatal("expected value")
	}

	if _, err := parseJSON(`{"a":1}`); err != nil {
		t.Fatal(err)
	}
	// empty / non-object input still returns a value for script convenience
	if v, err := parseJSON(``); err != nil || v == nil {
		t.Fatalf("empty json: %v %v", v, err)
	}

	d := &starlark.Dict{}
	_ = d.SetKey(starlark.String("n"), starlark.MakeInt(7))
	if n, ok := getDictInt(d, "n"); !ok || n != 7 {
		t.Fatalf("getDictInt: %d %v", n, ok)
	}
	if n, ok := toInt(5); !ok || n != 5 {
		t.Fatalf("toInt int: %d %v", n, ok)
	}
	if n, ok := toInt(int64(5)); !ok || n != 5 {
		t.Fatalf("toInt int64: %d %v", n, ok)
	}
	if n, ok := toInt(float64(5)); !ok || n != 5 {
		t.Fatalf("toInt float: %d %v", n, ok)
	}
	if n, ok := toInt64(int64(9)); !ok || n != 9 {
		t.Fatalf("toInt64: %d %v", n, ok)
	}
	if n, ok := toInt64(9); !ok || n != 9 {
		t.Fatalf("toInt64 int: %d %v", n, ok)
	}
}
