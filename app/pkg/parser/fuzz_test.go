package parser

import (
	"strings"
	"testing"
)

// FuzzParseHTTPFile ensures the parser never panics on arbitrary input.
func FuzzParseHTTPFile(f *testing.F) {
	// Seed corpus
	seeds := []string{
		"### Get\nGET https://example.com\n",
		"### Post\nPOST https://example.com\nContent-Type: application/json\n\n{\"key\":\"value\"}\n",
		"",
		"###",
		"GET",
		"### \n\n###\n",
		"POST https://example.com\nHost: example.com\n\nbody",
		strings.Repeat("###\nGET https://x.com\n", 100),
		"### Name\nGET {{base_url}}/{{path}}\nAuthorization: Bearer {{token}}\n",
		"\x00\x01\x02\x03",
		"# comment\n// also comment\n### Valid\nDELETE https://api.example.com/1\n",
	}
	for _, s := range seeds {
		f.Add(s)
	}

	f.Fuzz(func(t *testing.T, input string) {
		// Must not panic; error is acceptable
		reqs, err := ParseHTTPFile(strings.NewReader(input))
		if err != nil {
			return
		}
		// If parsing succeeded, WriteHTTPFile must also not panic
		if len(reqs) > 0 {
			_, _ = WriteHTTPFileString(reqs)
		}
	})
}

// FuzzWriteHTTPFile ensures WriteHTTPFile never panics on arbitrary request fields.
func FuzzWriteHTTPFile(f *testing.F) {
	f.Add("GET", "https://example.com", "Accept", "application/json", "")
	f.Add("POST", "https://{{host}}/path", "Content-Type", "application/json", `{"key":"{{value}}"}`)
	f.Add("", "", "", "", "")
	f.Add("DELETE", "https://api.example.com/items/1", "", "", "")

	f.Fuzz(func(t *testing.T, method, url, hdrKey, hdrVal, body string) {
		req := HTTPFileRequest{
			Method:  method,
			URL:     url,
			Headers: map[string]string{hdrKey: hdrVal},
			Body:    body,
		}
		_, _ = WriteHTTPFileString([]HTTPFileRequest{req})
	})
}
