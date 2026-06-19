package parser

import (
	"strings"
	"testing"
)

func TestParseHTTPFile_SingleRequest(t *testing.T) {
	input := `### Get Users
GET https://api.example.com/users
Accept: application/json
`
	reqs, err := ParseHTTPFile(strings.NewReader(input))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(reqs) != 1 {
		t.Fatalf("want 1 request, got %d", len(reqs))
	}
	r := reqs[0]
	if r.Name != "Get Users" {
		t.Errorf("Name: want 'Get Users', got %q", r.Name)
	}
	if r.Method != "GET" {
		t.Errorf("Method: want GET, got %s", r.Method)
	}
	if r.URL != "https://api.example.com/users" {
		t.Errorf("URL mismatch: %s", r.URL)
	}
	if r.Headers["Accept"] != "application/json" {
		t.Errorf("Accept header: got %q", r.Headers["Accept"])
	}
}

func TestParseHTTPFile_MultipleRequests(t *testing.T) {
	input := `### Get Users
GET https://api.example.com/users

### Create User
POST https://api.example.com/users
Content-Type: application/json

{"name": "Alice"}
`
	reqs, err := ParseHTTPFile(strings.NewReader(input))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(reqs) != 2 {
		t.Fatalf("want 2 requests, got %d", len(reqs))
	}

	get := reqs[0]
	if get.Method != "GET" {
		t.Errorf("first request method: want GET, got %s", get.Method)
	}

	post := reqs[1]
	if post.Method != "POST" {
		t.Errorf("second request method: want POST, got %s", post.Method)
	}
	if post.Headers["Content-Type"] != "application/json" {
		t.Errorf("Content-Type: got %q", post.Headers["Content-Type"])
	}
	if post.Body != `{"name": "Alice"}` {
		t.Errorf("Body: got %q", post.Body)
	}
}

func TestParseHTTPFile_WithTemplateVariables(t *testing.T) {
	input := `### Auth Request
POST {{base_url}}/auth
Authorization: Bearer {{token}}

{"user": "{{username}}"}
`
	reqs, err := ParseHTTPFile(strings.NewReader(input))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(reqs) != 1 {
		t.Fatalf("want 1 request, got %d", len(reqs))
	}
	r := reqs[0]
	if r.URL != "{{base_url}}/auth" {
		t.Errorf("URL: got %q", r.URL)
	}
	if r.Headers["Authorization"] != "Bearer {{token}}" {
		t.Errorf("Authorization header: got %q", r.Headers["Authorization"])
	}
}

func TestParseHTTPFile_SkipsComments(t *testing.T) {
	input := `# This is a file comment
### Fetch Data
# A request comment
GET https://example.com/data
// Another comment style
`
	reqs, err := ParseHTTPFile(strings.NewReader(input))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(reqs) != 1 {
		t.Fatalf("want 1 request, got %d", len(reqs))
	}
	if reqs[0].Method != "GET" {
		t.Errorf("Method: want GET, got %s", reqs[0].Method)
	}
}

func TestParseHTTPFile_EmptyInput(t *testing.T) {
	reqs, err := ParseHTTPFile(strings.NewReader(""))
	if err != nil {
		t.Fatalf("unexpected error on empty input: %v", err)
	}
	if len(reqs) != 0 {
		t.Errorf("want 0 requests, got %d", len(reqs))
	}
}

func TestParseHTTPFile_DeleteWithBody(t *testing.T) {
	input := `### Remove Item
DELETE https://api.example.com/items/42
Content-Type: application/json

{"reason": "expired"}
`
	reqs, err := ParseHTTPFile(strings.NewReader(input))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(reqs) != 1 {
		t.Fatalf("want 1 request, got %d", len(reqs))
	}
	if reqs[0].Method != "DELETE" {
		t.Errorf("Method: want DELETE, got %s", reqs[0].Method)
	}
	if reqs[0].Body != `{"reason": "expired"}` {
		t.Errorf("Body: got %q", reqs[0].Body)
	}
}

func TestParseHTTPFile_MethodCaseNormalization(t *testing.T) {
	input := `### Test
get https://example.com
`
	reqs, err := ParseHTTPFile(strings.NewReader(input))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(reqs) != 1 {
		t.Fatalf("want 1 request, got %d", len(reqs))
	}
	if reqs[0].Method != "GET" {
		t.Errorf("Method should be uppercased, got %s", reqs[0].Method)
	}
}

func TestWriteHTTPFile_Roundtrip(t *testing.T) {
	original := []HTTPFileRequest{
		{
			Name:    "List Items",
			Method:  "GET",
			URL:     "https://api.example.com/items",
			Headers: map[string]string{"Accept": "application/json"},
			Body:    "",
		},
		{
			Name:    "Create Item",
			Method:  "POST",
			URL:     "https://api.example.com/items",
			Headers: map[string]string{"Content-Type": "application/json"},
			Body:    `{"name": "Widget"}`,
		},
	}

	out, err := WriteHTTPFileString(original)
	if err != nil {
		t.Fatalf("write error: %v", err)
	}

	parsed, err := ParseHTTPFile(strings.NewReader(out))
	if err != nil {
		t.Fatalf("re-parse error: %v", err)
	}
	if len(parsed) != len(original) {
		t.Fatalf("roundtrip count: want %d, got %d", len(original), len(parsed))
	}
	for i, p := range parsed {
		o := original[i]
		if p.Name != o.Name {
			t.Errorf("[%d] Name: want %q, got %q", i, o.Name, p.Name)
		}
		if p.Method != o.Method {
			t.Errorf("[%d] Method: want %s, got %s", i, o.Method, p.Method)
		}
		if p.URL != o.URL {
			t.Errorf("[%d] URL: want %s, got %s", i, o.URL, p.URL)
		}
		if p.Body != o.Body {
			t.Errorf("[%d] Body: want %q, got %q", i, o.Body, p.Body)
		}
	}
}

func TestWriteHTTPFile_FallbackName(t *testing.T) {
	reqs := []HTTPFileRequest{
		{Method: "GET", URL: "https://example.com", Headers: map[string]string{}},
	}
	out, err := WriteHTTPFileString(reqs)
	if err != nil {
		t.Fatalf("write error: %v", err)
	}
	if !strings.Contains(out, "### GET https://example.com") {
		t.Errorf("expected fallback name in output, got:\n%s", out)
	}
}

func TestIsRequestLine(t *testing.T) {
	cases := []struct {
		line  string
		valid bool
	}{
		{"GET https://example.com", true},
		{"POST https://example.com", true},
		{"DELETE https://example.com/1", true},
		{"GRAPHQL https://graph.example.com", true},
		{"get https://example.com", true},
		{"not a request", false},
		{"", false},
	}

	for _, tc := range cases {
		got := isRequestLine(tc.line)
		if got != tc.valid {
			t.Errorf("isRequestLine(%q) = %v, want %v", tc.line, got, tc.valid)
		}
	}
}
