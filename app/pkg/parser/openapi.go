// Package parser provides parsing and generation for various API tool formats.
//
// OpenAPI 3.x and Swagger 2.0 spec support for zero-friction migration
// from OpenAPI-compatible tools to GoPost. Handles path extraction,
// base URL resolution, header/parameter mapping, and request body import.
package parser

import (
	"encoding/json"
	"fmt"
	"strings"
)

// OpenAPISpec represents a parsed OpenAPI 3.x or Swagger 2.0 specification.
// Both formats share the paths-oriented structure; this type normalizes the
// differences (servers vs host+basePath) during parsing.
type OpenAPISpec struct {
	OpenAPI  string                                `json:"openapi"`            // 3.x version string
	Swagger  string                                `json:"swagger"`            // 2.0 version string
	Info     OpenAPIInfo                           `json:"info"`               // spec metadata
	Servers  []OpenAPIServer                       `json:"servers,omitempty"`  // 3.x base URLs
	Host     string                                `json:"host,omitempty"`     // 2.0 host
	BasePath string                                `json:"basePath,omitempty"` // 2.0 base path prefix
	Schemes  []string                              `json:"schemes,omitempty"`  // 2.0 protocols
	Paths    map[string]map[string]json.RawMessage `json:"paths"`              // path → method → operation
}

// OpenAPIInfo contains spec-level metadata.
type OpenAPIInfo struct {
	Title   string `json:"title"`
	Version string `json:"version"`
}

// OpenAPIServer is a 3.x server object with a URL template.
type OpenAPIServer struct {
	URL string `json:"url"`
}

// OpenAPIOperation represents a single HTTP method on a path.
type OpenAPIOperation struct {
	Summary     string              `json:"summary"`
	Description string              `json:"description"`
	OperationID string              `json:"operationId"`
	Parameters  []OpenAPIParameter  `json:"parameters,omitempty"`
	RequestBody *OpenAPIRequestBody `json:"requestBody,omitempty"`
}

// OpenAPIParameter describes an operation parameter (query, header, path, cookie).
// Handles both OpenAPI 3.x (schema-based) and Swagger 2.0 (inline type/default) formats.
type OpenAPIParameter struct {
	Name     string         `json:"name"`
	In       string         `json:"in"`
	Required bool           `json:"required"`
	Type     string         `json:"type,omitempty"`    // Swagger 2.0 inline type
	Default  any            `json:"default,omitempty"` // Swagger 2.0 inline default
	Schema   *OpenAPISchema `json:"schema,omitempty"`  // OpenAPI 3.x schema
}

// OpenAPIRequestBody is the 3.x requestBody object.
type OpenAPIRequestBody struct {
	Content map[string]OpenAPIMediaType `json:"content"`
}

// OpenAPIMediaType describes a content media type entry.
type OpenAPIMediaType struct {
	Schema OpenAPISchema `json:"schema,omitempty"`
}

// OpenAPISchema is a JSON Schema subset used in parameters and bodies.
type OpenAPISchema struct {
	Type    string `json:"type,omitempty"`
	Example any    `json:"example,omitempty"`
	Default any    `json:"default,omitempty"`
}

// knownHTTPMethods lists the HTTP methods we extract from paths.
var knownHTTPMethods = map[string]bool{
	"get":     true,
	"post":    true,
	"put":     true,
	"patch":   true,
	"delete":  true,
	"options": true,
	"head":    true,
}

// ParseOpenAPISpec validates and parses an OpenAPI/Swagger JSON spec.
// Returns an error if the JSON is invalid or doesn't contain either
// the "openapi" (3.x) or "swagger" (2.0) top-level key.
func ParseOpenAPISpec(data []byte) (*OpenAPISpec, error) {
	var spec OpenAPISpec
	if err := json.Unmarshal(data, &spec); err != nil {
		return nil, fmt.Errorf("invalid OpenAPI spec JSON: %w", err)
	}

	if spec.OpenAPI == "" && spec.Swagger == "" {
		return nil, fmt.Errorf("not a valid OpenAPI/Swagger spec: missing 'openapi' or 'swagger' key")
	}

	if len(spec.Paths) == 0 {
		return nil, fmt.Errorf("not a valid OpenAPI/Swagger spec: missing 'paths'")
	}

	return &spec, nil
}

// ExtractOperations returns a flat list of importable requests for every
// HTTP method on every path in the spec. The operation ID, summary, or
// METHOD + path is used as the request name. Headers from header-type
// parameters and request bodies are included.
func ExtractOperations(spec *OpenAPISpec) []ImportedRequest {
	baseURL := resolveBaseURL(spec)
	requests := make([]ImportedRequest, 0)

	for path, methods := range spec.Paths {
		// The methods map has keys like "get", "post", "put", etc.
		// Some specs also have "parameters" at the path level (shared params).
		var pathLevelParams []OpenAPIParameter
		if raw, ok := methods["parameters"]; ok {
			json.Unmarshal(raw, &pathLevelParams)
		}

		for method, rawOp := range methods {
			method = strings.ToLower(method)
			if !knownHTTPMethods[method] {
				continue
			}

			var op OpenAPIOperation
			if err := json.Unmarshal(rawOp, &op); err != nil {
				continue
			}

			// Merge path-level and operation-level parameters
			allParams := append(pathLevelParams, op.Parameters...)

			headers := make(map[string]string)
			for _, p := range allParams {
				if p.In == "header" && p.Name != "" {
					headers[p.Name] = paramValue(p)
				}
			}

			body := ""
			if op.RequestBody != nil {
				// Prefer application/json content
				if mt, ok := op.RequestBody.Content["application/json"]; ok {
					example := schemaExampleJSON(mt.Schema)
					if example != "" {
						body = example
					}
				}
			}

			// Construct a display name
			name := op.OperationID
			if name == "" {
				name = op.Summary
			}
			if name == "" {
				name = strings.ToUpper(method) + " " + path
			}

			url := baseURL + path

			requests = append(requests, ImportedRequest{
				Name:        name,
				Method:      strings.ToUpper(method),
				URL:         url,
				Headers:     headers,
				Body:        body,
				Description: op.Description,
			})
		}
	}

	return requests
}

// resolveBaseURL constructs the base URL from the spec's server definitions.
// OpenAPI 3.x uses servers[0].url; Swagger 2.0 uses schemes[0]://host + basePath.
func resolveBaseURL(spec *OpenAPISpec) string {
	// OpenAPI 3.x: servers array — only use absolute URLs
	if len(spec.Servers) > 0 {
		url := spec.Servers[0].URL
		// Only use absolute URLs (http/https). Relative paths like "/api"
		// don't carry a host and would produce broken or double-prefixed URLs.
		if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
			return strings.TrimRight(url, "/")
		}
	}

	// Swagger 2.0: schemes + host + basePath
	if spec.Host != "" {
		scheme := "https"
		if len(spec.Schemes) > 0 {
			scheme = spec.Schemes[0]
		}
		basePath := spec.BasePath
		return scheme + "://" + spec.Host + basePath
	}

	// No server info — user will fill in the base URL
	return ""
}

// paramValue returns a placeholder value for a parameter, handling both
// OpenAPI 3.x (schema-based) and Swagger 2.0 (inline default) formats.
func paramValue(p OpenAPIParameter) string {
	// OpenAPI 3.x: schema.example or schema.default
	if p.Schema != nil {
		if p.Schema.Example != nil {
			return fmt.Sprintf("%v", p.Schema.Example)
		}
		if p.Schema.Default != nil {
			return fmt.Sprintf("%v", p.Schema.Default)
		}
	}
	// Swagger 2.0: inline default
	if p.Default != nil {
		return fmt.Sprintf("%v", p.Default)
	}
	return ""
}

// schemaExampleJSON produces a minimal JSON example body from a schema.
// For object schemas, returns "{}"; for other types returns "".
func schemaExampleJSON(schema OpenAPISchema) string {
	if schema.Type == "object" {
		return "{}"
	}
	if schema.Example != nil {
		return fmt.Sprintf("%v", schema.Example)
	}
	return ""
}
