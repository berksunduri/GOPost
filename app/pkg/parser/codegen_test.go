package parser

import (
	"strings"
	"testing"
)

func testRequest() CodeGenRequest {
	return CodeGenRequest{
		Method: "POST",
		URL:    "https://api.example.com/users",
		Headers: map[string]string{
			"Content-Type":  "application/json",
			"Authorization": "Bearer token123",
		},
		Body: `{"name": "John", "email": "john@example.com"}`,
	}
}

func TestGenerateCurl(t *testing.T) {
	code, err := GenerateCode(testRequest(), LangCurl)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if !strings.Contains(code, "curl -X POST") {
		t.Error("expected 'curl -X POST', got:\n" + code)
	}
	if !strings.Contains(code, "https://api.example.com/users") {
		t.Error("expected URL in curl output")
	}
	if !strings.Contains(code, "-H") {
		t.Error("expected -H flag in curl output")
	}
	if !strings.Contains(code, "-d") {
		t.Error("expected -d flag in curl output")
	}
}

func TestGenerateCurl_GET(t *testing.T) {
	req := CodeGenRequest{
		Method: "GET",
		URL:    "https://api.example.com/users",
	}
	code, err := GenerateCode(req, LangCurl)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if strings.Contains(code, "-d") {
		t.Error("GET request should not have -d flag")
	}
}

func TestGenerateFetch(t *testing.T) {
	code, err := GenerateCode(testRequest(), LangFetch)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if !strings.Contains(code, "fetch(") {
		t.Error("expected fetch() call")
	}
	if !strings.Contains(code, "method: \"POST\"") {
		t.Error("expected POST method")
	}
	if !strings.Contains(code, ".then(response => response.json())") {
		t.Error("expected .then chain")
	}
}

func TestGenerateAxios(t *testing.T) {
	code, err := GenerateCode(testRequest(), LangAxios)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if !strings.Contains(code, "axios({") {
		t.Error("expected axios() call")
	}
	if !strings.Contains(code, "method: \"post\"") {
		t.Error("expected lowercase post method")
	}
}

func TestGenerateGo(t *testing.T) {
	code, err := GenerateCode(testRequest(), LangGo)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if !strings.Contains(code, "package main") {
		t.Error("expected package main")
	}
	if !strings.Contains(code, "http.NewRequest") {
		t.Error("expected http.NewRequest")
	}
	if !strings.Contains(code, "io.ReadAll") {
		t.Error("expected io.ReadAll")
	}
}

func TestGenerateGo_GET(t *testing.T) {
	req := CodeGenRequest{
		Method: "GET",
		URL:    "https://api.example.com/health",
	}
	code, err := GenerateCode(req, LangGo)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if strings.Contains(code, "strings.NewReader") {
		t.Error("GET request should not use strings.NewReader")
	}
}

func TestGeneratePython(t *testing.T) {
	code, err := GenerateCode(testRequest(), LangPython)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if !strings.Contains(code, "import requests") {
		t.Error("expected 'import requests'")
	}
	if !strings.Contains(code, "requests.post(") {
		t.Error("expected requests.post()")
	}
}

func TestGenerateHTTPie(t *testing.T) {
	code, err := GenerateCode(testRequest(), LangHTTPie)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if !strings.HasPrefix(code, "http POST ") {
		t.Errorf("expected to start with 'http POST ', got: %s", code)
	}
}

func TestGenerateHTTPie_GET(t *testing.T) {
	req := CodeGenRequest{
		Method: "GET",
		URL:    "https://api.example.com/users",
	}
	code, err := GenerateCode(req, LangHTTPie)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if !strings.HasPrefix(code, "http ") || strings.HasPrefix(code, "http GET ") {
		t.Errorf("expected 'http <url>' for GET, got: %s", code)
	}
}

func TestGenerateCode_UnsupportedLanguage(t *testing.T) {
	_, err := GenerateCode(testRequest(), CodeLanguage("rust"))
	if err == nil {
		t.Error("expected error for unsupported language")
	}
}

func TestGenerateCode_EmptyMethod(t *testing.T) {
	req := CodeGenRequest{
		URL: "https://api.example.com/test",
	}
	code, err := GenerateCode(req, LangCurl)
	if err != nil {
		t.Fatalf("GenerateCode failed: %v", err)
	}

	if !strings.Contains(code, "GET") {
		t.Error("expected default GET method when empty")
	}
}

func TestAllLanguages(t *testing.T) {
	langs := AllLanguages()
	if len(langs) != 6 {
		t.Errorf("expected 6 languages, got %d", len(langs))
	}
}

func TestLanguageLabel(t *testing.T) {
	label := LanguageLabel(LangGo)
	if label != "Go (net/http)" {
		t.Errorf("expected 'Go (net/http)', got %q", label)
	}

	label = LanguageLabel(LangCurl)
	if label != "cURL" {
		t.Errorf("expected 'cURL', got %q", label)
	}
}
