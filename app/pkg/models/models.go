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
