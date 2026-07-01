package parser

import (
	"fmt"
	"strings"
)

// CodeLanguage identifies a target programming language for code generation.
type CodeLanguage string

// Supported code generation languages.
const (
	LangCurl   CodeLanguage = "curl"
	LangFetch  CodeLanguage = "fetch"
	LangAxios  CodeLanguage = "axios"
	LangGo     CodeLanguage = "go"
	LangPython CodeLanguage = "python"
	LangHTTPie CodeLanguage = "httpie"
)

// AllLanguages returns the list of all supported code generation languages.
func AllLanguages() []CodeLanguage {
	return []CodeLanguage{LangCurl, LangFetch, LangAxios, LangGo, LangPython, LangHTTPie}
}

// LanguageLabel returns a human-readable label for a code language.
func LanguageLabel(lang CodeLanguage) string {
	switch lang {
	case LangCurl:
		return "cURL"
	case LangFetch:
		return "JavaScript (fetch)"
	case LangAxios:
		return "JavaScript (axios)"
	case LangGo:
		return "Go (net/http)"
	case LangPython:
		return "Python (requests)"
	case LangHTTPie:
		return "HTTPie"
	default:
		return string(lang)
	}
}

// CodeGenRequest contains the request data needed for code generation.
type CodeGenRequest struct {
	Method  string
	URL     string
	Headers map[string]string
	Body    string
}

// GenerateCode produces a code snippet in the target language for the given request.
// Returns an error for unsupported languages.
func GenerateCode(req CodeGenRequest, lang CodeLanguage) (string, error) {
	// Use uppercase method for consistency
	req.Method = strings.ToUpper(req.Method)
	if req.Method == "" {
		req.Method = "GET"
	}

	switch lang {
	case LangCurl:
		return generateCurl(req), nil
	case LangFetch:
		return generateFetch(req), nil
	case LangAxios:
		return generateAxios(req), nil
	case LangGo:
		return generateGo(req), nil
	case LangPython:
		return generatePython(req), nil
	case LangHTTPie:
		return generateHTTPie(req), nil
	default:
		return "", fmt.Errorf("unsupported language: %s", lang)
	}
}

// escapeString escapes a string for safe inclusion in Go/JS/Python string literals.
func escapeString(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", "\\n")
	return s
}

// indentHeaderLines indents multi-line strings by the given prefix.
func indentHeaderLines(headers map[string]string, indent string) string {
	if len(headers) == 0 {
		return ""
	}
	var sb strings.Builder
	for k, v := range headers {
		sb.WriteString(indent)
		sb.WriteString(fmt.Sprintf("%q: %q,\n", k, v))
	}
	return sb.String()
}

// generateCurl produces a curl command.
func generateCurl(req CodeGenRequest) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("curl -X %s", req.Method))

	if req.Method == "HEAD" {
		sb.WriteString(" -I")
	}

	// Headers
	for k, v := range req.Headers {
		sb.WriteString(fmt.Sprintf(" \\\n  -H %q", k+": "+v))
	}

	// Body (skip for GET/HEAD)
	if req.Body != "" && req.Method != "GET" && req.Method != "HEAD" {
		sb.WriteString(fmt.Sprintf(" \\\n  -d %q", req.Body))
	}

	sb.WriteString(fmt.Sprintf(" \\\n  %q", req.URL))
	return sb.String()
}

// generateFetch produces a JavaScript fetch snippet.
func generateFetch(req CodeGenRequest) string {
	var sb strings.Builder

	// Build options object
	sb.WriteString(fmt.Sprintf("fetch(%q, {\n", req.URL))
	sb.WriteString(fmt.Sprintf("  method: %q,\n", req.Method))

	// Headers
	if len(req.Headers) > 0 {
		sb.WriteString("  headers: {\n")
		for k, v := range req.Headers {
			sb.WriteString(fmt.Sprintf("    %q: %q,\n", k, v))
		}
		sb.WriteString("  },\n")
	}

	// Body
	if req.Body != "" && req.Method != "GET" && req.Method != "HEAD" {
		contentType := req.Headers["Content-Type"]
		isJSON := strings.Contains(contentType, "json")
		if isJSON {
			// Pretty-print JSON body if possible
			sb.WriteString(fmt.Sprintf("  body: JSON.stringify(%s),\n", formatJSObject(req.Body)))
		} else {
			sb.WriteString(fmt.Sprintf("  body: %q,\n", req.Body))
		}
	}

	sb.WriteString("})\n")
	sb.WriteString("  .then(response => response.json())\n")
	sb.WriteString("  .then(data => console.log(data))\n")
	sb.WriteString("  .catch(error => console.error('Error:', error));")
	return sb.String()
}

// formatJSObject attempts to format a JSON body as a JS object.
func formatJSObject(body string) string {
	// Try to find JSON-like structure and wrap it as an object
	trimmed := strings.TrimSpace(body)
	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		return trimmed
	}
	// For non-JSON bodies, just quote it
	return fmt.Sprintf("%q", body)
}

// generateAxios produces a JavaScript axios snippet.
func generateAxios(req CodeGenRequest) string {
	var sb strings.Builder

	sb.WriteString("axios({\n")
	sb.WriteString(fmt.Sprintf("  method: %q,\n", strings.ToLower(req.Method)))
	sb.WriteString(fmt.Sprintf("  url: %q,\n", req.URL))

	// Headers
	if len(req.Headers) > 0 {
		sb.WriteString("  headers: {\n")
		for k, v := range req.Headers {
			sb.WriteString(fmt.Sprintf("    %q: %q,\n", k, v))
		}
		sb.WriteString("  },\n")
	}

	// Body
	if req.Body != "" && req.Method != "GET" && req.Method != "HEAD" {
		contentType := req.Headers["Content-Type"]
		isJSON := strings.Contains(contentType, "json")
		if isJSON {
			sb.WriteString(fmt.Sprintf("  data: %s,\n", formatJSObject(req.Body)))
		} else {
			sb.WriteString(fmt.Sprintf("  data: %q,\n", req.Body))
		}
	}

	sb.WriteString("})\n")
	sb.WriteString("  .then(response => console.log(response.data))\n")
	sb.WriteString("  .catch(error => console.error('Error:', error));")
	return sb.String()
}

// generateGo produces a Go net/http snippet.
func generateGo(req CodeGenRequest) string {
	var sb strings.Builder

	hasBody := req.Body != "" && req.Method != "GET" && req.Method != "HEAD"

	sb.WriteString("package main\n\n")
	sb.WriteString("import (\n")
	sb.WriteString("\t\"fmt\"\n")
	if hasBody {
		sb.WriteString("\t\"strings\"\n")
	}
	sb.WriteString("\t\"net/http\"\n")
	sb.WriteString("\t\"io\"\n")
	sb.WriteString(")\n\n")
	sb.WriteString("func main() {\n")

	if hasBody {
		contentType := req.Headers["Content-Type"]
		isJSON := strings.Contains(contentType, "json")
		if isJSON {
			sb.WriteString(fmt.Sprintf("\tbody := strings.NewReader(`%s`)\n", req.Body))
		} else {
			sb.WriteString(fmt.Sprintf("\tbody := strings.NewReader(%q)\n", req.Body))
		}
		sb.WriteString(fmt.Sprintf("\treq, err := http.NewRequest(%q, %q, body)\n", req.Method, req.URL))
	} else {
		sb.WriteString(fmt.Sprintf("\treq, err := http.NewRequest(%q, %q, nil)\n", req.Method, req.URL))
	}
	sb.WriteString("\tif err != nil {\n\t\tpanic(err)\n\t}\n\n")

	// Headers
	for k, v := range req.Headers {
		sb.WriteString(fmt.Sprintf("\treq.Header.Set(%q, %q)\n", k, v))
	}

	sb.WriteString("\n")
	sb.WriteString("\tresp, err := http.DefaultClient.Do(req)\n")
	sb.WriteString("\tif err != nil {\n\t\tpanic(err)\n\t}\n")
	sb.WriteString("\tdefer resp.Body.Close()\n\n")
	sb.WriteString("\tbodyBytes, err := io.ReadAll(resp.Body)\n")
	sb.WriteString("\tif err != nil {\n\t\tpanic(err)\n\t}\n\n")
	sb.WriteString("\tfmt.Println(resp.Status)\n")
	sb.WriteString("\tfmt.Println(string(bodyBytes))\n")
	sb.WriteString("}")
	return sb.String()
}

// generatePython produces a Python requests snippet.
func generatePython(req CodeGenRequest) string {
	var sb strings.Builder

	hasBody := req.Body != "" && req.Method != "GET" && req.Method != "HEAD"

	sb.WriteString("import requests\n\n")

	if len(req.Headers) > 0 {
		sb.WriteString("headers = {\n")
		for k, v := range req.Headers {
			sb.WriteString(fmt.Sprintf("    %q: %q,\n", k, v))
		}
		sb.WriteString("}\n\n")
	}

	methodLower := strings.ToLower(req.Method)

	if hasBody {
		contentType := req.Headers["Content-Type"]
		isJSON := strings.Contains(contentType, "json")
		if isJSON {
			sb.WriteString(fmt.Sprintf("data = %s\n\n", formatPyObject(req.Body)))
		} else {
			sb.WriteString(fmt.Sprintf("data = %q\n\n", req.Body))
		}
		sb.WriteString(fmt.Sprintf("response = requests.%s(%q, headers=headers, data=data)\n", methodLower, req.URL))
	} else if len(req.Headers) > 0 {
		sb.WriteString(fmt.Sprintf("response = requests.%s(%q, headers=headers)\n", methodLower, req.URL))
	} else {
		sb.WriteString(fmt.Sprintf("response = requests.%s(%q)\n", methodLower, req.URL))
	}

	sb.WriteString("\nprint(response.status_code)\n")
	sb.WriteString("print(response.json())")
	return sb.String()
}

// formatPyObject attempts to format a JSON body as a Python dict/list.
func formatPyObject(body string) string {
	trimmed := strings.TrimSpace(body)
	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		// Replace JSON null with None, true/false with True/False
		s := strings.ReplaceAll(trimmed, "null", "None")
		s = strings.ReplaceAll(s, "true", "True")
		s = strings.ReplaceAll(s, "false", "False")
		return s
	}
	return fmt.Sprintf("%q", body)
}

// generateHTTPie produces an HTTPie command.
func generateHTTPie(req CodeGenRequest) string {
	var sb strings.Builder

	method := strings.ToUpper(req.Method)
	if method == "GET" {
		// HTTPie defaults to GET
		sb.WriteString("http ")
	} else {
		sb.WriteString(fmt.Sprintf("http %s ", method))
	}

	sb.WriteString(req.URL)

	// Headers
	for k, v := range req.Headers {
		sb.WriteString(fmt.Sprintf(" \\\n  %s:%s", k, v))
	}

	// Body
	if req.Body != "" && method != "GET" && method != "HEAD" {
		contentType := req.Headers["Content-Type"]
		isJSON := strings.Contains(contentType, "json")
		if isJSON {
			sb.WriteString(fmt.Sprintf(" \\\n  %s", req.Body))
		} else {
			sb.WriteString(fmt.Sprintf(" \\\n  %s", req.Body))
		}
	}

	return sb.String()
}
