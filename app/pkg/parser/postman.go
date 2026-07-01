// Package parser provides parsing and generation for various API tool formats.
//
// Postman Collection v2.1 JSON format support for zero-friction migration
// from Postman to GoPost. Handles nested folder structures, request headers,
// bodies, auth, and environment variable references.
package parser

import (
	"encoding/json"
	"fmt"
	"strings"
)

// PostmanCollection represents a Postman Collection v2.1 JSON export.
type PostmanCollection struct {
	Info  PostmanInfo    `json:"info"`
	Item  []PostmanItem  `json:"item"`
	Event []PostmanEvent `json:"event,omitempty"`
	Auth  *PostmanAuth   `json:"auth,omitempty"`
}

// PostmanInfo contains collection metadata.
type PostmanInfo struct {
	Name   string `json:"name"`
	Schema string `json:"schema"`
}

// PostmanItem is a recursive item — can be a folder (has Item) or a request (has Request).
type PostmanItem struct {
	Name    string          `json:"name"`
	Request *PostmanRequest `json:"request,omitempty"`
	Item    []PostmanItem   `json:"item,omitempty"`
	Event   []PostmanEvent  `json:"event,omitempty"`
}

// PostmanRequest is a single HTTP request within a collection.
type PostmanRequest struct {
	Method string       `json:"method"`
	URL    *PostmanURL  `json:"url"`
	Header []PostmanKV  `json:"header,omitempty"`
	Body   *PostmanBody `json:"body,omitempty"`
	Auth   *PostmanAuth `json:"auth,omitempty"`
}

// PostmanURL represents a request URL, decomposed into parts or given as raw.
type PostmanURL struct {
	Raw   string      `json:"raw"`
	Host  []string    `json:"host,omitempty"`
	Path  []string    `json:"path,omitempty"`
	Query []PostmanKV `json:"query,omitempty"`
}

// PostmanKV is a key-value pair used for headers, query params, and variables.
type PostmanKV struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// PostmanBody is a request body.
type PostmanBody struct {
	Mode    string `json:"mode"`
	Raw     string `json:"raw,omitempty"`
	Options *struct {
		Raw struct {
			Language string `json:"language"`
		} `json:"raw,omitempty"`
	} `json:"options,omitempty"`
}

// PostmanAuth represents auth configuration.
type PostmanAuth struct {
	Type   string      `json:"type"`
	Bearer []PostmanKV `json:"bearer,omitempty"`
	Basic  []PostmanKV `json:"basic,omitempty"`
	APIKey []PostmanKV `json:"apikey,omitempty"`
}

// PostmanEvent represents a pre-request or test script.
type PostmanEvent struct {
	Listen string         `json:"listen"`
	Script *PostmanScript `json:"script,omitempty"`
}

// PostmanScript is an inline JavaScript script block.
type PostmanScript struct {
	Exec []string `json:"exec,omitempty"`
	Type string   `json:"type,omitempty"`
}

// PostmanEnvironment represents a Postman environment JSON export.
type PostmanEnvironment struct {
	Name   string            `json:"name"`
	Values []PostmanEnvValue `json:"values"`
}

// PostmanEnvValue is a single environment variable.
type PostmanEnvValue struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// ImportedRequest is the result of parsing a Postman collection item into a
// flat request structure ready for import into GoPost.
type ImportedRequest struct {
	Name        string
	Method      string
	URL         string
	Headers     map[string]string
	Body        string
	Description string
	FolderPath  string // dot-separated folder path, e.g. "Users.Auth"
	AuthType    string
	AuthToken   string
}

// ParsePostmanCollection parses a Postman Collection v2.1 JSON export and returns
// a flat list of importable requests. Nested folders are flattened with a FolderPath
// annotation for folder reconstruction on the GoPost side.
func ParsePostmanCollection(data []byte) (*PostmanCollection, error) {
	var coll PostmanCollection
	if err := json.Unmarshal(data, &coll); err != nil {
		return nil, fmt.Errorf("invalid Postman collection JSON: %w", err)
	}
	if coll.Info.Schema == "" {
		return nil, fmt.Errorf("not a valid Postman collection: missing info.schema")
	}
	return &coll, nil
}

// FlattenRequests extracts all requests from a Postman collection, flattening
// nested folder structures into a single list with FolderPath annotations.
func FlattenRequests(coll *PostmanCollection) []ImportedRequest {
	requests := make([]ImportedRequest, 0)
	flattenItems(coll.Item, "", &requests)
	return requests
}

// flattenItems recursively walks PostmanItem trees.
func flattenItems(items []PostmanItem, parentPath string, out *[]ImportedRequest) {
	for _, item := range items {
		// Recurse into sub-folders
		if len(item.Item) > 0 {
			childPath := item.Name
			if parentPath != "" {
				childPath = parentPath + "." + item.Name
			}
			flattenItems(item.Item, childPath, out)
		}

		// Extract request if present
		if item.Request != nil {
			req := convertRequest(item, parentPath)
			*out = append(*out, req)
		}
	}
}

// convertRequest maps a PostmanItem + Request into a flat ImportedRequest.
func convertRequest(item PostmanItem, folderPath string) ImportedRequest {
	req := item.Request

	url := ""
	if req.URL != nil {
		url = req.URL.Raw
	}
	if url == "" && req.URL != nil {
		// Reconstruct from parts if raw is empty
		url = reconstructURL(req.URL)
	}

	headers := make(map[string]string)
	for _, h := range req.Header {
		if h.Key != "" {
			headers[h.Key] = h.Value
		}
	}

	body := ""
	if req.Body != nil {
		switch req.Body.Mode {
		case "raw":
			body = req.Body.Raw
		case "formdata", "urlencoded":
			// For non-raw modes, skip body import — they require different handling
		}
	}

	description := item.Name
	if item.Request != nil && item.Request.URL != nil {
		description = item.Request.Method + " " + url
	}

	// Determine method
	method := strings.ToUpper(req.Method)
	if method == "" {
		method = "GET"
	}

	// Derive a reasonable name: use item.Name if it's not a raw URL.
	// Postman collections sometimes use URLs as item names which produces
	// excessively long filenames. In that case, fall back to METHOD + path.
	name := item.Name
	if name == "" || strings.HasPrefix(name, "http://") || strings.HasPrefix(name, "https://") {
		name = method + " " + urlToDisplay(url)
	}

	// Extract auth from item-level or request-level
	authType, authToken := extractAuth(item)

	return ImportedRequest{
		Name:        name,
		Method:      method,
		URL:         url,
		Headers:     headers,
		Body:        body,
		Description: description,
		FolderPath:  folderPath,
		AuthType:    authType,
		AuthToken:   authToken,
	}
}

// reconstructURL builds a URL string from decomposed Postman URL parts.
func reconstructURL(u *PostmanURL) string {
	var sb strings.Builder
	if len(u.Host) > 0 {
		sb.WriteString(strings.Join(u.Host, "."))
	} else {
		sb.WriteString("localhost")
	}
	if len(u.Path) > 0 {
		sb.WriteByte('/')
		sb.WriteString(strings.Join(u.Path, "/"))
	}
	if len(u.Query) > 0 {
		sb.WriteByte('?')
		for i, q := range u.Query {
			if i > 0 {
				sb.WriteByte('&')
			}
			sb.WriteString(q.Key)
			if q.Value != "" {
				sb.WriteByte('=')
				sb.WriteString(q.Value)
			}
		}
	}
	return sb.String()
}

// extractAuth pulls auth configuration from a PostmanItem or its request.
// Item-level auth takes precedence, falling back to request-level auth.
func extractAuth(item PostmanItem) (authType, token string) {
	auth := item.Request.Auth
	if auth == nil {
		auth = item.Request.Auth
	}
	if auth == nil {
		return "", ""
	}

	switch strings.ToLower(auth.Type) {
	case "bearer":
		for _, kv := range auth.Bearer {
			if strings.EqualFold(kv.Key, "token") {
				return "bearer", kv.Value
			}
		}
	case "apikey":
		for _, kv := range auth.APIKey {
			if strings.EqualFold(kv.Key, "value") {
				return "apikey", kv.Value
			}
		}
	}
	return "", ""
}

// urlToDisplay strips query parameters from a URL to produce a short display name.
func urlToDisplay(rawURL string) string {
	if idx := strings.IndexByte(rawURL, '?'); idx != -1 {
		return rawURL[:idx]
	}
	return rawURL
}

// ParsePostmanEnvironment parses a Postman environment JSON export.
func ParsePostmanEnvironment(data []byte) (*PostmanEnvironment, error) {
	var env PostmanEnvironment
	if err := json.Unmarshal(data, &env); err != nil {
		return nil, fmt.Errorf("invalid Postman environment JSON: %w", err)
	}
	if env.Name == "" {
		return nil, fmt.Errorf("not a valid Postman environment: missing name")
	}
	return &env, nil
}

// ExtractScript converts a PostmanEvent list into pre-request and test script strings.
// Postman scripts are JavaScript — we store them as Starlark comments so users
// know they need manual conversion. The plan doc mentions auto-converting
// pm.environment.set() calls, which can be added as a future enhancement.
func ExtractScript(events []PostmanEvent) (preRequest, test string) {
	for _, ev := range events {
		if ev.Script == nil || len(ev.Script.Exec) == 0 {
			continue
		}
		script := strings.Join(ev.Script.Exec, "\n")
		// Wrap in comment to indicate manual conversion is needed
		wrapped := "# Postman script (requires manual Starlark conversion):\n"
		for _, line := range strings.Split(script, "\n") {
			wrapped += "# " + line + "\n"
		}

		switch ev.Listen {
		case "prerequest":
			preRequest = wrapped
		case "test":
			test = wrapped
		}
	}
	return
}
