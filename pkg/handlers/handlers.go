package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"gopost/pkg/models"
	"gopost/pkg/storage"

	"github.com/google/uuid"
)

// Handler manages HTTP handlers
type Handler struct {
	store *storage.Storage
}

// New creates a new handler
func New(store *storage.Storage) *Handler {
	return &Handler{store: store}
}

// JSON helpers
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func readJSON(r *http.Request, v interface{}) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}

// Collection Handlers

// GetCollections handles GET /api/collections
func (h *Handler) GetCollections(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	collections, err := h.store.GetCollections()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if collections == nil {
		collections = []models.Collection{}
	}
	writeJSON(w, http.StatusOK, collections)
}

// CreateCollection handles POST /api/collections
func (h *Handler) CreateCollection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name string `json:"name"`
	}

	if err := readJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}

	collection := &models.Collection{
		ID:        uuid.New().String(),
		Name:      req.Name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := h.store.SaveCollection(collection); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, collection)
}

// GetCollection handles GET /api/collections/{id}
func (h *Handler) GetCollection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Path[len("/api/collections/"):]
	collection, err := h.store.GetCollection(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Collection not found"})
		return
	}

	writeJSON(w, http.StatusOK, collection)
}

// UpdateCollection handles PUT /api/collections/{id}
func (h *Handler) UpdateCollection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Path[len("/api/collections/"):]
	collection, err := h.store.GetCollection(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Collection not found"})
		return
	}

	var req struct {
		Name string `json:"name"`
	}

	if err := readJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}

	collection.Name = req.Name
	collection.UpdatedAt = time.Now()

	if err := h.store.SaveCollection(collection); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, collection)
}

// DeleteCollection handles DELETE /api/collections/{id}
func (h *Handler) DeleteCollection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Path[len("/api/collections/"):]
	if err := h.store.DeleteCollection(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Request Handlers

// GetRequests handles GET /api/collections/{collectionId}/requests
func (h *Handler) GetRequests(w http.ResponseWriter, r *http.Request, collectionID string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	requests, err := h.store.GetRequests(collectionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if requests == nil {
		requests = []models.HTTPRequest{}
	}
	writeJSON(w, http.StatusOK, requests)
}

// CreateRequest handles POST /api/collections/{collectionId}/requests
func (h *Handler) CreateRequest(w http.ResponseWriter, r *http.Request, collectionID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name        string            `json:"name"`
		Method      string            `json:"method"`
		URL         string            `json:"url"`
		Headers     map[string]string `json:"headers"`
		Body        string            `json:"body"`
		Description string            `json:"description"`
		FolderID    string            `json:"folder_id"`
	}

	if err := readJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}

	httpReq := &models.HTTPRequest{
		ID:           uuid.New().String(),
		Name:         req.Name,
		Method:       req.Method,
		URL:          req.URL,
		Headers:      req.Headers,
		Body:         req.Body,
		Description:  req.Description,
		CollectionID: collectionID,
		FolderID:     req.FolderID,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := h.store.SaveRequest(httpReq); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, httpReq)
}

// UpdateRequest handles PUT /api/requests/{id}
func (h *Handler) UpdateRequest(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	httpReq, err := h.store.GetRequest(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Request not found"})
		return
	}

	var req struct {
		Name        string            `json:"name"`
		Method      string            `json:"method"`
		URL         string            `json:"url"`
		Headers     map[string]string `json:"headers"`
		Body        string            `json:"body"`
		Description string            `json:"description"`
	}

	if err := readJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}

	httpReq.Name = req.Name
	httpReq.Method = req.Method
	httpReq.URL = req.URL
	httpReq.Headers = req.Headers
	httpReq.Body = req.Body
	httpReq.Description = req.Description
	httpReq.UpdatedAt = time.Now()

	if err := h.store.SaveRequest(httpReq); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, httpReq)
}

// DeleteRequest handles DELETE /api/requests/{id}
func (h *Handler) DeleteRequest(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := h.store.DeleteRequest(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ExecuteRequest handles POST /api/requests/{id}/execute
func (h *Handler) ExecuteRequest(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	httpReq, err := h.store.GetRequest(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Request not found"})
		return
	}

	// Create HTTP request
	req, err := http.NewRequest(httpReq.Method, httpReq.URL, io.NopCloser(nil))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	// Add headers
	for key, value := range httpReq.Headers {
		req.Header.Set(key, value)
	}

	// Add body if present
	if httpReq.Body != "" {
		req.Body = io.NopCloser(io.Reader(strings.NewReader(httpReq.Body)))
		req.Header.Set("Content-Type", "application/json")
	}

	// Execute request
	client := &http.Client{Timeout: 30 * time.Second}
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Prepare response headers
	headers := make(map[string]string)
	for key, values := range resp.Header {
		if len(values) > 0 {
			headers[key] = values[0]
		}
	}

	result := map[string]interface{}{
		"status":  resp.Status,
		"code":    resp.StatusCode,
		"headers": headers,
		"body":    string(body),
		"time":    time.Since(start).Milliseconds(),
	}

	writeJSON(w, http.StatusOK, result)
}

// Environment Handlers

// GetEnvironments handles GET /api/environments
func (h *Handler) GetEnvironments(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	environments, err := h.store.GetEnvironments()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if environments == nil {
		environments = []models.Environment{}
	}
	writeJSON(w, http.StatusOK, environments)
}

// CreateEnvironment handles POST /api/environments
func (h *Handler) CreateEnvironment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string                 `json:"name"`
		Variables map[string]interface{} `json:"variables"`
	}

	if err := readJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}

	environment := &models.Environment{
		ID:        uuid.New().String(),
		Name:      req.Name,
		Variables: req.Variables,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := h.store.SaveEnvironment(environment); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, environment)
}

// DeleteEnvironment handles DELETE /api/environments/{id}
func (h *Handler) DeleteEnvironment(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := h.store.DeleteEnvironment(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
