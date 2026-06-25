// Package parser provides .http file parsing and generation.
//
// The .http format is the standard used by VS Code REST Client, IntelliJ HTTP Client,
// and other tools. Files contain one or more requests separated by ### delimiters.
//
// Example:
//
//	### Get Users
//	GET https://api.example.com/users
//	Authorization: Bearer {{token}}
//
//	### Create User
//	POST https://api.example.com/users
//	Content-Type: application/json
//
//	{"name": "John", "email": "john@example.com"}
package parser

import (
	"bufio"
	"fmt"
	"io"
	"strings"
)

// HTTPFileRequest represents a single request parsed from a .http file.
type HTTPFileRequest struct {
	Name    string
	Method  string
	URL     string
	Headers map[string]string
	Body    string
}

// ParseHTTPFile reads a .http file and returns all parsed requests.
// Requests are separated by lines starting with ###.
// Optional request names follow ### (e.g., "### Get Users").
func ParseHTTPFile(r io.Reader) ([]HTTPFileRequest, error) {
	scanner := bufio.NewScanner(r)
	var requests []HTTPFileRequest
	var current *HTTPFileRequest
	var bodyBuilder strings.Builder
	inBody := false
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		// Comment or request separator
		if strings.HasPrefix(trimmed, "###") {
			if current != nil {
				current.Body = bodyBuilder.String()
				requests = append(requests, *finalizeRequest(current))
			}
			bodyBuilder.Reset()
			name := strings.TrimSpace(strings.TrimPrefix(trimmed, "###"))
			current = &HTTPFileRequest{
				Name:    name,
				Headers: make(map[string]string),
			}
			inBody = false
			continue
		}

		// Skip empty lines and single-line comments before a request starts
		if current == nil {
			continue
		}

		// Skip comment lines (# or //)
		if strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "//") {
			continue
		}

		// Empty line after headers means body starts
		if trimmed == "" && current.Method != "" && !inBody {
			inBody = true
			continue
		}

		// Request line: METHOD URL [HTTP/1.1]
		if current.Method == "" && !inBody {
			if isRequestLine(trimmed) {
				parts := strings.Fields(trimmed)
				if len(parts) >= 2 {
					current.Method = strings.ToUpper(parts[0])
					current.URL = parts[1]
				}
				continue
			}
			// If we can't parse a method but have a name, treat as body
			// This handles edge cases where a name was set but no request line follows
			continue
		}

		// Header line: Key: Value (before body starts)
		if !inBody && strings.Contains(trimmed, ":") {
			parts := strings.SplitN(trimmed, ":", 2)
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			if key != "" {
				current.Headers[key] = value
			}
			continue
		}

		// Body content
		if current.Method != "" {
			if bodyBuilder.Len() > 0 {
				bodyBuilder.WriteByte('\n')
			}
			bodyBuilder.WriteString(line) // Preserve original line including indentation
		}
	}

	// Add the last request
	if current != nil {
		current.Body = bodyBuilder.String()
		requests = append(requests, *finalizeRequest(current))
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return requests, nil
}

// finalizeRequest trims trailing newlines from the body.
func finalizeRequest(r *HTTPFileRequest) *HTTPFileRequest {
	r.Body = strings.TrimSpace(r.Body)
	return r
}

// isRequestLine checks if a line starts with a known HTTP method.
func isRequestLine(line string) bool {
	upper := strings.ToUpper(strings.TrimSpace(line))
	methods := []string{"GET ", "POST ", "PUT ", "DELETE ", "PATCH ", "HEAD ", "OPTIONS ", "GRAPHQL "}
	for _, m := range methods {
		if strings.HasPrefix(upper, m) {
			return true
		}
	}
	return false
}

// WriteHTTPFile generates a .http file from a slice of requests.
// The output is compatible with VS Code REST Client and IntelliJ HTTP Client.
func WriteHTTPFile(w io.Writer, requests []HTTPFileRequest) error {
	for i, req := range requests {
		// Request name separator
		name := req.Name
		if name == "" {
			name = fmt.Sprintf("%s %s", req.Method, req.URL)
		}
		if _, err := fmt.Fprintf(w, "### %s\n", name); err != nil {
			return err
		}

		// Request line
		if _, err := fmt.Fprintf(w, "%s %s\n", req.Method, req.URL); err != nil {
			return err
		}

		// Headers
		for k, v := range req.Headers {
			if _, err := fmt.Fprintf(w, "%s: %s\n", k, v); err != nil {
				return err
			}
		}

		// Body
		if req.Body != "" {
			if _, err := fmt.Fprintf(w, "\n%s\n", req.Body); err != nil {
				return err
			}
		}

		// Blank line between requests
		if i < len(requests)-1 {
			if _, err := fmt.Fprintln(w); err != nil {
				return err
			}
		}
	}
	return nil
}

// WriteHTTPFileString is a convenience wrapper that returns the .http content as a string.
func WriteHTTPFileString(requests []HTTPFileRequest) (string, error) {
	var sb strings.Builder
	if err := WriteHTTPFile(&sb, requests); err != nil {
		return "", err
	}
	return sb.String(), nil
}
