package models

import "time"

// Collection represents a collection of requests
type Collection struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Folder represents a folder within a collection
type Folder struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	CollectionID string    `json:"collection_id"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// HTTPRequest represents an HTTP request
type HTTPRequest struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Method       string            `json:"method"`
	URL          string            `json:"url"`
	Headers      map[string]string `json:"headers"`
	Auth         RequestAuth       `json:"auth"`
	Body         string            `json:"body"`
	Description  string            `json:"description"`
	GraphQL      *GraphQLPayload   `json:"graphql,omitempty"`
	CollectionID string            `json:"collection_id"`
	FolderID     string            `json:"folder_id,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
}

type RequestAuth struct {
	Type        string `json:"type"`
	Token       string `json:"token,omitempty"`
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
	APIKey      string `json:"api_key,omitempty"`
	APIKeyValue string `json:"api_key_value,omitempty"`
	APIKeyIn    string `json:"api_key_in,omitempty"`
}

// Environment represents an environment with variables
type Environment struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	Variables map[string]interface{} `json:"variables"`
	CreatedAt time.Time              `json:"created_at"`
	UpdatedAt time.Time              `json:"updated_at"`
}

// Response represents a stored response
type Response struct {
	ID        string            `json:"id"`
	RequestID string            `json:"request_id"`
	Status    int               `json:"status"`
	Headers   map[string]string `json:"headers"`
	Body      string            `json:"body"`
	Time      int64             `json:"time"`
	CreatedAt time.Time         `json:"created_at"`
}

type HistoryEntry struct {
	ID             string            `json:"id"`
	RequestID      string            `json:"request_id"`
	RequestName    string            `json:"request_name"`
	Method         string            `json:"method"`
	URL            string            `json:"url"`
	RequestHeaders map[string]string `json:"request_headers"`
	RequestBody    string            `json:"request_body"`
	RequestAuth    RequestAuth       `json:"request_auth"`
	Status         string            `json:"status"`
	Code           int               `json:"code"`
	Headers        map[string]string `json:"headers"`
	Body           string            `json:"body"`
	TimeMs         int64             `json:"time_ms"`
	CollectionID   string            `json:"collection_id"`
	CollectionName string            `json:"collection_name"`
	CreatedAt      time.Time         `json:"created_at"`
}

type ExportData struct {
	Version      int            `json:"version"`
	Collections  []Collection   `json:"collections"`
	Requests     []HTTPRequest  `json:"requests"`
	Environments []Environment  `json:"environments"`
	History      []HistoryEntry `json:"history"`
}

// ==================== Git-Friendly Storage Models ====================

// CollectionManifest stores lightweight collection metadata.
// Lives at: collections/{name}/collection.gopost.json
type CollectionManifest struct {
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Schema      int       `json:"schema"` // For future migrations
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Order       []string  `json:"order"` // Request file names in display order
}

// RequestFile is a self-contained request stored as its own file.
// Lives at: collections/{name}/requests/{request-name}.gopost.json
type RequestFile struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Method      string            `json:"method"`
	URL         string            `json:"url"`
	Headers     map[string]string `json:"headers"`
	Auth        RequestAuth       `json:"auth"`
	Body        string            `json:"body"`
	Description string            `json:"description"`
	GraphQL     *GraphQLPayload   `json:"graphql,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

func (r *RequestFile) ToHTTPRequest(collectionID string) *HTTPRequest {
	return &HTTPRequest{
		ID:           r.ID,
		Name:         r.Name,
		Method:       r.Method,
		URL:          r.URL,
		Headers:      r.Headers,
		Auth:         r.Auth,
		Body:         r.Body,
		Description:  r.Description,
		GraphQL:      r.GraphQL,
		CollectionID: collectionID,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
	}
}

// GraphQLPayload stores GraphQL-specific request data alongside the request.
type GraphQLPayload struct {
	Query         string `json:"query"`
	Variables     string `json:"variables"` // JSON-encoded variables
	OperationName string `json:"operation_name,omitempty"`
	SchemaURL     string `json:"schema_url,omitempty"` // URL used for introspection
}

// CachedGraphQLSchema stores an introspected GraphQL schema.
type CachedGraphQLSchema struct {
	URL            string                 `json:"url"`
	Schema         map[string]interface{} `json:"schema"`
	IntrospectedAt time.Time              `json:"introspected_at"`
}

func RequestFileFromHTTPRequest(req *HTTPRequest) *RequestFile {
	rf := &RequestFile{
		ID:          req.ID,
		Name:        req.Name,
		Method:      req.Method,
		URL:         req.URL,
		Headers:     req.Headers,
		Auth:        req.Auth,
		Body:        req.Body,
		Description: req.Description,
		CreatedAt:   req.CreatedAt,
		UpdatedAt:   req.UpdatedAt,
	}
	if req.GraphQL != nil {
		rf.GraphQL = req.GraphQL
	}
	return rf
}
