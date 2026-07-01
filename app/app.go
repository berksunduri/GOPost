package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"

	"gopost/app/pkg/gitops"
	"gopost/app/pkg/mock"
	"gopost/app/pkg/models"
	"gopost/app/pkg/parser"
	"gopost/app/pkg/scripting"
	"gopost/app/pkg/sse"
	"gopost/app/pkg/websocket"
)

// Store is the data persistence interface used by App.
type Store interface {
	// Collections
	GetCollections() ([]models.Collection, error)
	GetCollection(id string) (*models.Collection, error)
	SaveCollection(c *models.Collection) error
	DeleteCollection(id string) error
	GetCollectionDir(id string) string

	// Requests
	GetRequests(collectionID string) ([]models.HTTPRequest, error)
	GetAllRequests() ([]models.HTTPRequest, error)
	GetRequest(id string) (*models.HTTPRequest, error)
	SaveRequest(req *models.HTTPRequest) error
	DeleteRequest(id string) error
	DeleteRequestFromCollection(requestID, collectionID string) error

	// Environments
	GetEnvironments() ([]models.Environment, error)
	GetEnvironment(id string) (*models.Environment, error)
	SaveEnvironment(env *models.Environment) error
	DeleteEnvironment(id string) error

	// History
	GetHistory() ([]models.HistoryEntry, error)
	SaveHistoryEntry(entry *models.HistoryEntry) error
	DeleteHistoryEntriesForCollection(collectionID string) error

	// Import/Export
	ReplaceAllData(data *models.ExportData) error

	// User Config
	GetUserConfig() (*models.UserConfig, error)
	SaveUserConfig(cfg *models.UserConfig) error

	// Run Reports
	SaveRunReport(collectionID string, summary map[string]any) error
	GetRunHistory(collectionID string) ([]map[string]any, error)

	// Mock Configs
	SaveMockConfig(mc *models.MockConfig) error
	GetMockConfigs(collectionID string) ([]models.MockConfig, error)
	DeleteMockConfig(collectionID, requestID string) error

	// Info
	GetBaseDir() string
}

// CreateRequestParams holds parameters for App.CreateRequest.
type CreateRequestParams struct {
	CollectionID string
	Name         string
	Method       string
	URL          string
	Headers      map[string]string
	Body         string
	Description  string
}

// UpdateRequestParams holds parameters for App.UpdateRequest and App.UpdateRequestWithGraphQL.
type UpdateRequestParams struct {
	Name        string
	Method      string
	URL         string
	Headers     map[string]string
	Body        string
	Description string
	GraphQL     *UpdateGraphQLParams
}

// UpdateGraphQLParams holds GraphQL-specific parameters for update operations.
type UpdateGraphQLParams struct {
	Query         string
	Variables     string
	OperationName string
	SchemaURL     string
}

// SetRequestAuthParams holds parameters for App.SetRequestAuth.
type SetRequestAuthParams struct {
	AuthType    string
	Token       string
	Username    string
	Password    string
	APIKey      string
	APIKeyValue string
	APIKeyIn    string
}

// ExecuteRequestParams holds parameters for App.ExecuteRequest.
type ExecuteRequestParams struct {
	EnvVars map[string]string
}

// schemaStore holds the GraphQL schema cache and its lock.
type schemaStore struct {
	mu    sync.RWMutex
	cache map[string]*models.CachedGraphQLSchema
}

// connStore manages WebSocket and SSE client connections.
type connStore struct {
	wsClients   map[string]*websocket.Client
	wsClientsMu sync.Mutex

	sseClients   map[string]*sse.Client
	sseClientsMu sync.Mutex
}

// App struct
type App struct {
	ctx          context.Context
	git          Store
	termPort     int
	scriptEngine *scripting.Engine
	httpClient   *http.Client
	mockServer   *mock.Server
	schema       schemaStore
	conns        connStore

	// onMockEvent is called with ("status" | "log", data) whenever the mock
	// server state changes. Set from main.go to bridge into Wails events.
	onMockEvent func(kind string, data any)
}

// SetMockEventCallback configures a callback for mock server status/log changes.
// Called from main.go to bridge mock events into the Wails event bus.
func (a *App) SetMockEventCallback(fn func(kind string, data any)) {
	a.onMockEvent = fn
	a.mockServer.OnActivity = a.handleMockActivity
}

func (a *App) handleMockActivity(kind string, data any) {
	if a.onMockEvent != nil {
		a.onMockEvent(kind, data)
	}
}

// NewApp creates a new App application struct.
func NewApp(store Store) *App {
	return &App{
		git:          store,
		scriptEngine: scripting.NewEngine(),
		httpClient:   newSharedHTTPClient(),
		mockServer:   mock.NewServer(),
		schema: schemaStore{
			cache: make(map[string]*models.CachedGraphQLSchema),
		},
		conns: connStore{
			wsClients:  make(map[string]*websocket.Client),
			sseClients: make(map[string]*sse.Client),
		},
	}
}

// newSharedHTTPClient creates an HTTP client with connection pooling
// for reuse across all request executions.
func newSharedHTTPClient() *http.Client {
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   20,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ForceAttemptHTTP2:     true,
	}
	return &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
	}
}

// ServiceStartup is called when the Wails service starts
func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.ctx = ctx
	if TerminalEnabled {
		go a.startTerminalServer()
	}
	return nil
}

// ==================== Collections ====================

// GetCollections returns all collections
func (a *App) GetCollections() ([]models.Collection, error) {
	return a.git.GetCollections()
}

// CreateCollection creates a new collection
func (a *App) CreateCollection(name string) (*models.Collection, error) {
	collection := &models.Collection{
		ID:        uuid.New().String(),
		Name:      name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err := a.git.SaveCollection(collection)
	if err != nil {
		return nil, err
	}

	return collection, nil
}

// UpdateCollection updates an existing collection
func (a *App) UpdateCollection(id string, name string) (*models.Collection, error) {
	collection, err := a.git.GetCollection(id)
	if err != nil {
		return nil, err
	}

	collection.Name = name
	collection.UpdatedAt = time.Now()

	err = a.git.SaveCollection(collection)
	if err != nil {
		return nil, err
	}

	return collection, nil
}

// DeleteCollection deletes a collection and all associated history entries
func (a *App) DeleteCollection(id string) (map[string]bool, error) {
	// Clean up history entries that reference this collection
	if err := a.git.DeleteHistoryEntriesForCollection(id); err != nil {
		slog.Warn("failed to clean history entries", "collection", id, "error", err)
	}
	err := a.git.DeleteCollection(id)
	return map[string]bool{"ok": true}, err
}

// ==================== Requests ====================

// GetRequestsForCollection returns all requests in a collection
func (a *App) GetRequestsForCollection(collectionID string) ([]models.HTTPRequest, error) {
	return a.git.GetRequests(collectionID)
}

// CreateRequest creates a new HTTP request
func (a *App) CreateRequest(p CreateRequestParams) (*models.HTTPRequest, error) {
	if p.Headers == nil {
		p.Headers = make(map[string]string)
	}

	request := &models.HTTPRequest{
		ID:           uuid.New().String(),
		Name:         p.Name,
		Method:       p.Method,
		URL:          p.URL,
		Headers:      p.Headers,
		Auth:         models.RequestAuth{Type: "none"},
		Body:         p.Body,
		Description:  p.Description,
		CollectionID: p.CollectionID,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	err := a.git.SaveRequest(request)
	if err != nil {
		return nil, err
	}

	return request, nil
}

func (a *App) DuplicateRequest(id string) (*models.HTTPRequest, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}
	request.ID = uuid.New().String()
	request.Name = request.Name + " Copy"
	request.CreatedAt = time.Now()
	request.UpdatedAt = time.Now()
	if err := a.git.SaveRequest(request); err != nil {
		return nil, err
	}
	return request, nil
}

func (a *App) MoveRequest(id string, collectionID string) (*models.HTTPRequest, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}
	oldCollectionID := request.CollectionID
	request.CollectionID = collectionID
	request.UpdatedAt = time.Now()
	if err := a.git.SaveRequest(request); err != nil {
		return nil, err
	}
	if oldCollectionID != collectionID {
		a.git.DeleteRequestFromCollection(id, oldCollectionID)
	}
	return request, nil
}

func (a *App) SearchRequests(query string) ([]models.HTTPRequest, error) {
	requests, err := a.git.GetAllRequests()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(query) == "" {
		return requests, nil
	}
	needle := strings.ToLower(strings.TrimSpace(query))
	filtered := make([]models.HTTPRequest, 0)
	for _, request := range requests {
		if strings.Contains(strings.ToLower(request.Name), needle) || strings.Contains(strings.ToLower(request.URL), needle) {
			filtered = append(filtered, request)
		}
	}
	return filtered, nil
}

// UpdateRequest updates an existing request
func (a *App) UpdateRequest(id string, p UpdateRequestParams) (*models.HTTPRequest, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}

	request.Name = p.Name
	request.Method = p.Method
	request.URL = p.URL
	request.Headers = p.Headers
	request.Body = p.Body
	request.Description = p.Description
	request.UpdatedAt = time.Now()

	err = a.git.SaveRequest(request)
	if err != nil {
		return nil, err
	}

	return request, nil
}

func (a *App) SetRequestAuth(id string, p SetRequestAuthParams) (*models.HTTPRequest, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}
	request.Auth = models.RequestAuth{
		Type:        p.AuthType,
		Token:       p.Token,
		Username:    p.Username,
		Password:    p.Password,
		APIKey:      p.APIKey,
		APIKeyValue: p.APIKeyValue,
		APIKeyIn:    p.APIKeyIn,
	}
	request.UpdatedAt = time.Now()
	if err := a.git.SaveRequest(request); err != nil {
		return nil, err
	}
	return request, nil
}

// DeleteRequest deletes a request
func (a *App) DeleteRequest(id string) (map[string]bool, error) {
	err := a.git.DeleteRequest(id)
	return map[string]bool{"ok": true}, err
}

// ExecuteRequest executes an HTTP request and returns the response.
// Runs pre-request scripts before sending and test scripts after receiving.
func (a *App) ExecuteRequest(id string, p ExecuteRequestParams) (map[string]interface{}, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}

	// Apply environment variable substitution to URL, body, and headers.
	// This is the single source of truth — the frontend saves raw templates.
	if len(p.EnvVars) > 0 {
		request.URL = substituteVars(request.URL, p.EnvVars)
		request.Body = substituteVars(request.Body, p.EnvVars)
		substitutedHeaders := make(map[string]string, len(request.Headers))
		for k, v := range request.Headers {
			substitutedHeaders[substituteVars(k, p.EnvVars)] = substituteVars(v, p.EnvVars)
		}
		request.Headers = substitutedHeaders
	}

	// Script env is mainly for chaining between pre-request and test scripts.
	env := p.EnvVars
	if env == nil {
		env = make(map[string]string)
	}

	// Run pre-request script
	if request.PreRequestScript != "" {
		modified, err := a.scriptEngine.PreRequestScript(request.PreRequestScript, request, env)
		if err != nil {
			return nil, fmt.Errorf("pre-request script: %w", err)
		}
		request = modified
	}

	// Create HTTP request
	req, err := http.NewRequest(request.Method, request.URL, io.NopCloser(strings.NewReader("")))
	if err != nil {
		return nil, err
	}

	// Add headers
	headers := map[string]string{}
	for key, value := range request.Headers {
		headers[key] = value
	}
	a.applyAuth(&headers, request.Auth, req.URL)
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	// Add body if present
	if request.Body != "" {
		req.Body = io.NopCloser(strings.NewReader(request.Body))
		if req.Header.Get("Content-Type") == "" {
			req.Header.Set("Content-Type", "application/json")
		}
	}

	// Execute request
	client := a.httpClient
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Prepare response headers
	responseHeaders := make(map[string]string)
	for key, values := range resp.Header {
		if len(values) > 0 {
			responseHeaders[key] = values[0]
		}
	}

	result := map[string]any{
		"status":  resp.Status,
		"code":    resp.StatusCode,
		"headers": responseHeaders,
		"body":    string(body),
		"time":    time.Since(start).Milliseconds(),
	}

	collections, _ := a.git.GetCollections()
	collectionName := ""
	for _, collection := range collections {
		if collection.ID == request.CollectionID {
			collectionName = collection.Name
			break
		}
	}
	entry := &models.HistoryEntry{
		ID:             uuid.New().String(),
		RequestID:      request.ID,
		RequestName:    request.Name,
		Method:         request.Method,
		URL:            request.URL,
		RequestHeaders: request.Headers,
		RequestBody:    request.Body,
		RequestAuth:    request.Auth,
		Status:         resp.Status,
		Code:           resp.StatusCode,
		Headers:        responseHeaders,
		Body:           string(body),
		TimeMs:         time.Since(start).Milliseconds(),
		CollectionID:   request.CollectionID,
		CollectionName: collectionName,
		CreatedAt:      time.Now(),
	}
	_ = a.git.SaveHistoryEntry(entry)

	// Run test script
	if request.TestScript != "" {
		testResult := a.scriptEngine.TestScript(request.TestScript, request, result, env)
		result["test_result"] = map[string]any{
			"passed":      testResult.Passed,
			"error":       testResult.Error,
			"failures":    testResult.Failures,
			"duration_ms": testResult.DurationMs,
		}

		// Apply any environment variable modifications from test script
		if len(env) > 0 {
			a.applyEnvFromScript(env)
		}
	}

	return result, nil
}

// ==================== Environments ====================

// GetEnvironments returns all environments
func (a *App) GetEnvironments() ([]models.Environment, error) {
	return a.git.GetEnvironments()
}

// CreateEnvironment creates a new environment
func (a *App) CreateEnvironment(name string, variables map[string]interface{}) (*models.Environment, error) {
	if variables == nil {
		variables = make(map[string]interface{})
	}

	environment := &models.Environment{
		ID:        uuid.New().String(),
		Name:      name,
		Variables: variables,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err := a.git.SaveEnvironment(environment)
	if err != nil {
		return nil, err
	}

	return environment, nil
}

// UpdateEnvironment updates an environment
func (a *App) UpdateEnvironment(id string, name string, variables map[string]interface{}) (*models.Environment, error) {
	environment, err := a.git.GetEnvironment(id)
	if err != nil {
		return nil, err
	}

	environment.Name = name
	environment.Variables = variables
	environment.UpdatedAt = time.Now()

	err = a.git.SaveEnvironment(environment)
	if err != nil {
		return nil, err
	}

	return environment, nil
}

// DeleteEnvironment deletes an environment
func (a *App) DeleteEnvironment(id string) (map[string]bool, error) {
	err := a.git.DeleteEnvironment(id)
	return map[string]bool{"ok": true}, err
}

func (a *App) GetHistory() ([]models.HistoryEntry, error) {
	return a.git.GetHistory()
}

// GetUserConfig returns the current user preferences (theme, shortcuts, etc.)
func (a *App) GetUserConfig() (*models.UserConfig, error) {
	return a.git.GetUserConfig()
}

// SaveUserConfig persists user preferences and returns the saved config.
func (a *App) SaveUserConfig(cfg *models.UserConfig) (*models.UserConfig, error) {
	err := a.git.SaveUserConfig(cfg)
	return cfg, err
}

// GetRunHistory returns saved collection run reports
func (a *App) GetRunHistory(collectionID string) ([]map[string]interface{}, error) {
	return a.git.GetRunHistory(collectionID)
}

// GetRequest returns a single request by ID
func (a *App) GetRequest(id string) (*models.HTTPRequest, error) {
	return a.git.GetRequest(id)
}

func (a *App) ReplayHistoryEntry(entryID string) (map[string]interface{}, error) {
	history, err := a.git.GetHistory()
	if err != nil {
		return nil, err
	}
	for _, entry := range history {
		if entry.ID == entryID {
			request, reqErr := a.CreateRequest(CreateRequestParams{
				CollectionID: entry.CollectionID,
				Name:         entry.RequestName,
				Method:       entry.Method,
				URL:          entry.URL,
				Headers:      entry.RequestHeaders,
				Body:         entry.RequestBody,
				Description:  "Replayed from history",
			})
			if reqErr != nil {
				return nil, reqErr
			}
			_, _ = a.SetRequestAuth(request.ID, SetRequestAuthParams{
				AuthType:    entry.RequestAuth.Type,
				Token:       entry.RequestAuth.Token,
				Username:    entry.RequestAuth.Username,
				Password:    entry.RequestAuth.Password,
				APIKey:      entry.RequestAuth.APIKey,
				APIKeyValue: entry.RequestAuth.APIKeyValue,
				APIKeyIn:    entry.RequestAuth.APIKeyIn,
			})
			return a.ExecuteRequest(request.ID, ExecuteRequestParams{})
		}
	}
	return nil, fmt.Errorf("history entry not found")
}

func (a *App) ExportData(filePath string) error {
	data, err := a.ExportSnapshot()
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, raw, 0600)
}

func (a *App) ExportSnapshot() (*models.ExportData, error) {
	collections, err := a.git.GetCollections()
	if err != nil {
		return nil, err
	}
	requests, err := a.git.GetAllRequests()
	if err != nil {
		return nil, err
	}
	environments, err := a.git.GetEnvironments()
	if err != nil {
		return nil, err
	}
	history, err := a.git.GetHistory()
	if err != nil {
		return nil, err
	}
	data := &models.ExportData{
		Version:      1,
		Collections:  collections,
		Requests:     requests,
		Environments: environments,
		History:      history,
	}
	return data, nil
}

func (a *App) ImportData(filePath string) error {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}
	var data models.ExportData
	if err := json.Unmarshal(raw, &data); err != nil {
		return err
	}
	return a.ImportSnapshot(data)
}

func (a *App) ImportSnapshot(data models.ExportData) error {
	if data.Version != 1 {
		return fmt.Errorf("unsupported import version: %d", data.Version)
	}
	return a.git.ReplaceAllData(&data)
}

func (a *App) MergeSnapshot(data models.ExportData) error {
	if data.Version != 1 {
		return fmt.Errorf("unsupported import version: %d", data.Version)
	}
	existingCollections, err := a.git.GetCollections()
	if err != nil {
		return err
	}
	existingRequests, err := a.git.GetAllRequests()
	if err != nil {
		return err
	}
	existingEnvironments, err := a.git.GetEnvironments()
	if err != nil {
		return err
	}
	existingHistory, err := a.git.GetHistory()
	if err != nil {
		return err
	}

	collectionByID := map[string]models.Collection{}
	for _, collection := range existingCollections {
		collectionByID[collection.ID] = collection
	}
	for _, collection := range data.Collections {
		collectionByID[collection.ID] = collection
	}
	requestByID := map[string]models.HTTPRequest{}
	for _, request := range existingRequests {
		requestByID[request.ID] = request
	}
	for _, request := range data.Requests {
		requestByID[request.ID] = request
	}
	environmentByID := map[string]models.Environment{}
	for _, environment := range existingEnvironments {
		environmentByID[environment.ID] = environment
	}
	for _, environment := range data.Environments {
		environmentByID[environment.ID] = environment
	}
	historyByID := map[string]models.HistoryEntry{}
	for _, entry := range existingHistory {
		historyByID[entry.ID] = entry
	}
	for _, entry := range data.History {
		historyByID[entry.ID] = entry
	}

	merged := models.ExportData{
		Version: 1,
	}
	for _, collection := range collectionByID {
		merged.Collections = append(merged.Collections, collection)
	}
	for _, request := range requestByID {
		merged.Requests = append(merged.Requests, request)
	}
	for _, environment := range environmentByID {
		merged.Environments = append(merged.Environments, environment)
	}
	for _, entry := range historyByID {
		merged.History = append(merged.History, entry)
	}
	return a.git.ReplaceAllData(&merged)
}

// ==================== .http File Import / Export ====================

// ImportHTTPContent parses .http file content and imports all requests into a collection.
// Returns the count of imported requests and their details.
func (a *App) ImportHTTPContent(content string, collectionID string) (map[string]interface{}, error) {
	parsed, err := parser.ParseHTTPFile(strings.NewReader(content))
	if err != nil {
		return nil, fmt.Errorf("failed to parse .http file: %w", err)
	}
	if len(parsed) == 0 {
		return nil, fmt.Errorf("no requests found in .http content")
	}

	imported := make([]map[string]interface{}, 0, len(parsed))
	for _, pr := range parsed {
		name := pr.Name
		if name == "" {
			name = pr.Method + " " + pr.URL
		}
		req, err := a.CreateRequest(CreateRequestParams{
			CollectionID: collectionID,
			Name:         name,
			Method:       pr.Method,
			URL:          pr.URL,
			Headers:      pr.Headers,
			Body:         pr.Body,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to import request %q: %w", name, err)
		}
		imported = append(imported, map[string]interface{}{
			"id":     req.ID,
			"name":   name,
			"method": req.Method,
			"url":    req.URL,
		})
	}
	return map[string]interface{}{
		"count":    len(imported),
		"requests": imported,
	}, nil
}

// ExportCollectionAsHTTPContent exports all requests in a collection as .http file content.
func (a *App) ExportCollectionAsHTTPContent(collectionID string) (string, error) {
	requests, err := a.git.GetRequests(collectionID)
	if err != nil {
		return "", err
	}
	if len(requests) == 0 {
		return "", fmt.Errorf("collection has no requests")
	}

	httpReqs := make([]parser.HTTPFileRequest, 0, len(requests))
	for _, req := range requests {
		httpReqs = append(httpReqs, parser.HTTPFileRequest{
			Name:    req.Name,
			Method:  req.Method,
			URL:     req.URL,
			Headers: req.Headers,
			Body:    req.Body,
		})
	}
	return parser.WriteHTTPFileString(httpReqs)
}

// ExportCollectionAsHTTPFile saves collection as .http file to the user's Downloads folder
// and opens it in the default application.
func (a *App) ExportCollectionAsHTTPFile(collectionID string) (map[string]interface{}, error) {
	content, err := a.ExportCollectionAsHTTPContent(collectionID)
	if err != nil {
		return nil, err
	}

	col, err := a.git.GetCollection(collectionID)
	if err != nil {
		return nil, err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("home directory: %w", err)
	}
	dir := filepath.Join(home, "Downloads")
	os.MkdirAll(dir, 0700)

	fileName := strings.Map(func(r rune) rune {
		if r == ' ' {
			return '-'
		}
		return r
	}, col.Name) + ".http"
	path := filepath.Join(dir, fileName)

	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}

	// Open the file with the default app
	_ = openPath(path)

	return map[string]interface{}{
		"path": path,
		"ok":   true,
	}, nil
}

// ==================== Postman Collection Import ====================

// ImportPostmanCollection parses a Postman Collection v2.1 JSON export and
// imports all requests into a new (or existing) GoPost collection.
// Returns the collection and a summary of imported requests.
func (a *App) ImportPostmanCollection(content string, collectionID string) (map[string]interface{}, error) {
	coll, err := parser.ParsePostmanCollection([]byte(content))
	if err != nil {
		return nil, fmt.Errorf("failed to parse Postman collection: %w", err)
	}

	requests := parser.FlattenRequests(coll)
	if len(requests) == 0 {
		return nil, fmt.Errorf("no requests found in Postman collection")
	}

	// Ensure the target collection exists
	_, err = a.git.GetCollection(collectionID)
	if err != nil {
		return nil, fmt.Errorf("collection not found: %w", err)
	}

	imported := make([]map[string]interface{}, 0, len(requests))
	for _, ir := range requests {
		name := ir.Name
		if name == "" {
			name = ir.Method + " " + ir.URL
		}

		req, err := a.CreateRequest(CreateRequestParams{
			CollectionID: collectionID,
			Name:         name,
			Method:       ir.Method,
			URL:          ir.URL,
			Headers:      ir.Headers,
			Body:         ir.Body,
			Description:  ir.Description,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to import request %q: %w", name, err)
		}

		// Apply auth if extracted from Postman
		if ir.AuthType != "" {
			authParams := SetRequestAuthParams{AuthType: ir.AuthType}
			switch ir.AuthType {
			case "bearer":
				authParams.Token = ir.AuthToken
			case "apikey":
				authParams.APIKeyValue = ir.AuthToken
			}
			_, _ = a.SetRequestAuth(req.ID, authParams)
		}

		result := map[string]interface{}{
			"id":     req.ID,
			"name":   name,
			"method": req.Method,
			"url":    req.URL,
		}
		if ir.FolderPath != "" {
			result["folder"] = ir.FolderPath
		}
		imported = append(imported, result)
	}

	return map[string]interface{}{
		"collection_name": coll.Info.Name,
		"count":           len(imported),
		"requests":        imported,
	}, nil
}

// ImportPostmanEnvironment parses a Postman environment JSON and creates a
// GoPost environment with the same variables.
func (a *App) ImportPostmanEnvironment(content string) (*models.Environment, error) {
	env, err := parser.ParsePostmanEnvironment([]byte(content))
	if err != nil {
		return nil, err
	}

	variables := make(map[string]interface{})
	for _, v := range env.Values {
		if v.Enabled {
			variables[v.Key] = v.Value
		}
	}

	return a.CreateEnvironment(env.Name, variables)
}

// ==================== OpenAPI/Swagger Import ====================

// ImportOpenAPISpec parses an OpenAPI 3.x or Swagger 2.0 JSON spec and
// imports all endpoint operations as requests into a GoPost collection.
func (a *App) ImportOpenAPISpec(content string, collectionID string) (map[string]interface{}, error) {
	spec, err := parser.ParseOpenAPISpec([]byte(content))
	if err != nil {
		return nil, fmt.Errorf("failed to parse OpenAPI spec: %w", err)
	}

	requests := parser.ExtractOperations(spec)
	if len(requests) == 0 {
		return nil, fmt.Errorf("no operations found in OpenAPI spec")
	}

	// Ensure the target collection exists
	_, err = a.git.GetCollection(collectionID)
	if err != nil {
		return nil, fmt.Errorf("collection not found: %w", err)
	}

	imported := make([]map[string]interface{}, 0, len(requests))
	for _, ir := range requests {
		name := ir.Name
		if name == "" {
			name = ir.Method + " " + ir.URL
		}

		req, err := a.CreateRequest(CreateRequestParams{
			CollectionID: collectionID,
			Name:         name,
			Method:       ir.Method,
			URL:          ir.URL,
			Headers:      ir.Headers,
			Body:         ir.Body,
			Description:  ir.Description,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to import request %q: %w", name, err)
		}

		result := map[string]interface{}{
			"id":     req.ID,
			"name":   name,
			"method": req.Method,
			"url":    req.URL,
		}
		imported = append(imported, result)
	}

	specVersion := "OpenAPI " + spec.OpenAPI
	if spec.Swagger != "" {
		specVersion = "Swagger " + spec.Swagger
	}

	return map[string]interface{}{
		"spec_title":   spec.Info.Title,
		"spec_version": specVersion,
		"count":        len(imported),
		"requests":     imported,
	}, nil
}

// ==================== Code Generation ====================

// GenerateCode produces a code snippet for the given request in the target language.
// Supported languages: curl, fetch, axios, go, python, httpie.
func (a *App) GenerateCode(requestID string, language string) (map[string]interface{}, error) {
	req, err := a.git.GetRequest(requestID)
	if err != nil {
		return nil, fmt.Errorf("request not found: %w", err)
	}

	lang := parser.CodeLanguage(language)
	code, err := parser.GenerateCode(parser.CodeGenRequest{
		Method:  req.Method,
		URL:     req.URL,
		Headers: req.Headers,
		Body:    req.Body,
	}, lang)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"language": language,
		"label":    parser.LanguageLabel(lang),
		"code":     code,
	}, nil
}

// GetCodeLanguages returns the list of supported code generation languages
// with their human-readable labels.
func (a *App) GetCodeLanguages() []map[string]string {
	langs := parser.AllLanguages()
	result := make([]map[string]string, 0, len(langs))
	for _, lang := range langs {
		result = append(result, map[string]string{
			"id":    string(lang),
			"label": parser.LanguageLabel(lang),
		})
	}
	return result
}

func (a *App) applyAuth(headers *map[string]string, auth models.RequestAuth, requestURL *url.URL) {
	switch auth.Type {
	case "bearer":
		if auth.Token != "" {
			(*headers)["Authorization"] = "Bearer " + auth.Token
		}
	case "basic":
		if auth.Username != "" || auth.Password != "" {
			token := base64.StdEncoding.EncodeToString([]byte(auth.Username + ":" + auth.Password))
			(*headers)["Authorization"] = "Basic " + token
		}
	case "apikey":
		if auth.APIKey != "" && auth.APIKeyValue != "" {
			if auth.APIKeyIn == "query" {
				q := requestURL.Query()
				q.Set(auth.APIKey, auth.APIKeyValue)
				requestURL.RawQuery = q.Encode()
			} else {
				(*headers)[auth.APIKey] = auth.APIKeyValue
			}
		}
	}
}

func (a *App) RunCollection(collectionID string, stopOnFail bool) (map[string]interface{}, error) {
	requests, err := a.git.GetRequests(collectionID)
	if err != nil {
		return nil, err
	}
	results := make([]map[string]interface{}, 0, len(requests))
	passed := 0
	failed := 0
	for _, request := range requests {
		result, execErr := a.ExecuteRequest(request.ID, ExecuteRequestParams{})
		item := map[string]interface{}{
			"request_id":   request.ID,
			"request_name": request.Name,
			"success":      execErr == nil,
		}
		if execErr != nil {
			item["error"] = execErr.Error()
			failed++
			results = append(results, item)
			if stopOnFail {
				break
			}
			continue
		}
		expectedStatus := request.Headers["X-Expected-Status"]
		if expectedStatus != "" && fmt.Sprintf("%v", result["code"]) != expectedStatus {
			item["success"] = false
			item["error"] = fmt.Sprintf("expected status %s got %v", expectedStatus, result["code"])
			failed++
		} else {
			passed++
		}
		item["result"] = result
		results = append(results, item)
		if expectedStatus != "" && item["success"] == false && stopOnFail {
			break
		}
	}

	summary := map[string]interface{}{
		"collection_id": collectionID,
		"total":         len(results),
		"passed":        passed,
		"failed":        failed,
		"results":       results,
		"timestamp":     time.Now().Format(time.RFC3339),
	}

	// Save run report to disk
	a.git.SaveRunReport(collectionID, summary)

	return summary, nil
}

// ==================== GraphQL ====================

// graphQLIntrospectionQuery is the standard introspection query sent to GraphQL endpoints.
const graphQLIntrospectionQuery = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          args { name description type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } defaultValue }
          type { name kind ofType { name kind ofType { name kind ofType { name kind } } } }
          isDeprecated
          deprecationReason
        }
        inputFields { name description type { name kind ofType { name kind } } defaultValue }
        interfaces { name }
        enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
        possibleTypes { name }
      }
    }
  }
`

// IntrospectGraphQLSchema fetches and caches the GraphQL schema from the given endpoint.
func (a *App) IntrospectGraphQLSchema(endpointURL string) (map[string]interface{}, error) {
	// Check cache first
	a.schema.mu.RLock()
	if cached, ok := a.schema.cache[endpointURL]; ok {
		a.schema.mu.RUnlock()
		return cached.Schema, nil
	}
	a.schema.mu.RUnlock()

	// Build introspection request
	body := map[string]string{
		"query": graphQLIntrospectionQuery,
	}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal introspection query: %w", err)
	}

	req, err := http.NewRequest("POST", endpointURL, strings.NewReader(string(bodyJSON)))
	if err != nil {
		return nil, fmt.Errorf("failed to create introspection request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := a.httpClient
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("introspection failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read introspection response: %w", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse introspection response: %w", err)
	}

	// Check for GraphQL errors
	if errors, ok := result["errors"]; ok {
		return nil, fmt.Errorf("introspection returned errors: %v", errors)
	}

	// Cache the schema (cap at 50 entries, evict oldest on overflow).
	a.schema.mu.Lock()
	const maxSchemaCache = 50
	if len(a.schema.cache) >= maxSchemaCache {
		var oldestURL string
		var oldestTime time.Time
		for u, c := range a.schema.cache {
			if oldestURL == "" || c.IntrospectedAt.Before(oldestTime) {
				oldestURL = u
				oldestTime = c.IntrospectedAt
			}
		}
		delete(a.schema.cache, oldestURL)
	}
	a.schema.cache[endpointURL] = &models.CachedGraphQLSchema{
		URL:            endpointURL,
		Schema:         result,
		IntrospectedAt: time.Now(),
	}
	a.schema.mu.Unlock()

	return result, nil
}

// GetCachedGraphQLSchema returns a previously introspected schema.
func (a *App) GetCachedGraphQLSchema(url string) (map[string]interface{}, error) {
	a.schema.mu.RLock()
	defer a.schema.mu.RUnlock()
	cached, ok := a.schema.cache[url]
	if !ok {
		return nil, fmt.Errorf("no cached schema for %s — call IntrospectGraphQLSchema first", url)
	}
	return cached.Schema, nil
}

// ExecuteGraphQLRequest executes a GraphQL request and returns the response.
func (a *App) ExecuteGraphQLRequest(id string) (map[string]interface{}, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}

	gql := request.GraphQL
	if gql == nil {
		// Fallback: treat body as raw GraphQL query
		gql = &models.GraphQLPayload{Query: request.Body}
	}

	// Build the GraphQL POST body
	gqlBody := map[string]interface{}{
		"query": gql.Query,
	}
	if gql.Variables != "" && gql.Variables != "{}" {
		var vars map[string]interface{}
		if err := json.Unmarshal([]byte(gql.Variables), &vars); err == nil && len(vars) > 0 {
			gqlBody["variables"] = vars
		}
	}
	if gql.OperationName != "" {
		gqlBody["operationName"] = gql.OperationName
	}

	bodyJSON, err := json.Marshal(gqlBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal GraphQL body: %w", err)
	}

	req, err := http.NewRequest("POST", request.URL, strings.NewReader(string(bodyJSON)))
	if err != nil {
		return nil, err
	}

	// Add headers
	headers := map[string]string{"Content-Type": "application/json"}
	for key, value := range request.Headers {
		headers[key] = value
	}
	a.applyAuth(&headers, request.Auth, req.URL)
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	client := a.httpClient
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	responseHeaders := make(map[string]string)
	for key, values := range resp.Header {
		if len(values) > 0 {
			responseHeaders[key] = values[0]
		}
	}

	// Parse the body as JSON to split data / errors
	var parsed map[string]interface{}
	json.Unmarshal(respBody, &parsed)

	result := map[string]interface{}{
		"status":  resp.Status,
		"code":    resp.StatusCode,
		"headers": responseHeaders,
		"body":    string(respBody),
		"data":    nil,
		"errors":  nil,
		"time":    time.Since(start).Milliseconds(),
	}

	if parsed != nil {
		if data, ok := parsed["data"]; ok {
			result["data"] = data
		}
		if errors, ok := parsed["errors"]; ok {
			result["errors"] = errors
		}
	}

	// Save to history
	collections, _ := a.git.GetCollections()
	collectionName := ""
	for _, collection := range collections {
		if collection.ID == request.CollectionID {
			collectionName = collection.Name
			break
		}
	}
	entry := &models.HistoryEntry{
		ID:             uuid.New().String(),
		RequestID:      request.ID,
		RequestName:    request.Name,
		Method:         "GRAPHQL",
		URL:            request.URL,
		RequestHeaders: request.Headers,
		RequestBody:    string(bodyJSON),
		RequestAuth:    request.Auth,
		Status:         resp.Status,
		Code:           resp.StatusCode,
		Headers:        responseHeaders,
		Body:           string(respBody),
		TimeMs:         time.Since(start).Milliseconds(),
		CollectionID:   request.CollectionID,
		CollectionName: collectionName,
		CreatedAt:      time.Now(),
	}
	_ = a.git.SaveHistoryEntry(entry)

	return result, nil
}

// SetRequestGraphQL sets GraphQL-specific data on a request.
func (a *App) SetRequestGraphQL(id, query, variables, operationName, schemaURL string) (*models.HTTPRequest, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}

	request.GraphQL = &models.GraphQLPayload{
		Query:         query,
		Variables:     variables,
		OperationName: operationName,
		SchemaURL:     schemaURL,
	}
	request.Method = "GRAPHQL"
	request.UpdatedAt = time.Now()

	if err := a.git.SaveRequest(request); err != nil {
		return nil, err
	}
	return request, nil
}

// UpdateRequestWithGraphQL updates a request including GraphQL fields.
func (a *App) UpdateRequestWithGraphQL(id string, p UpdateRequestParams) (*models.HTTPRequest, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}

	request.Name = p.Name
	request.Method = p.Method
	request.URL = p.URL
	request.Headers = p.Headers
	request.Body = p.Body
	request.Description = p.Description
	request.UpdatedAt = time.Now()

	if p.Method == "GRAPHQL" && p.GraphQL != nil && p.GraphQL.Query != "" {
		if request.GraphQL == nil {
			request.GraphQL = &models.GraphQLPayload{}
		}
		request.GraphQL.Query = p.GraphQL.Query
		request.GraphQL.Variables = p.GraphQL.Variables
		request.GraphQL.OperationName = p.GraphQL.OperationName
		request.GraphQL.SchemaURL = p.GraphQL.SchemaURL
	} else if p.Method != "GRAPHQL" {
		request.GraphQL = nil
	}

	err = a.git.SaveRequest(request)
	if err != nil {
		return nil, err
	}
	return request, nil
}

// ==================== WebSocket ====================

// ConnectWebSocket creates a new WebSocket connection and starts reading messages.
// Returns the connection ID for subsequent operations.
func (a *App) ConnectWebSocket(requestID, url string, headers map[string]string) (map[string]interface{}, error) {
	connID := uuid.New().String()

	client := websocket.NewClient(connID, url)
	if err := client.Connect(headers); err != nil {
		return nil, err
	}

	a.conns.wsClientsMu.Lock()
	a.conns.wsClients[connID] = client
	a.conns.wsClientsMu.Unlock()

	// Save the WS request to the collection if requestID is provided
	if requestID != "" {
		req, err := a.git.GetRequest(requestID)
		if err == nil {
			req.URL = url
			req.Headers = headers
			req.Method = "WS"
			req.UpdatedAt = time.Now()
			_ = a.git.SaveRequest(req)
		}
	}

	return map[string]interface{}{
		"connID": connID,
		"url":    url,
		"status": "connected",
	}, nil
}

// DisconnectWebSocket closes an active WebSocket connection.
func (a *App) DisconnectWebSocket(connID string) error {
	a.conns.wsClientsMu.Lock()
	client, ok := a.conns.wsClients[connID]
	if !ok {
		a.conns.wsClientsMu.Unlock()
		return fmt.Errorf("WebSocket connection %s not found", connID)
	}
	delete(a.conns.wsClients, connID)
	a.conns.wsClientsMu.Unlock()

	return client.Disconnect()
}

// SendWebSocketMessage sends a text message through an active WebSocket connection.
func (a *App) SendWebSocketMessage(connID, message string) error {
	a.conns.wsClientsMu.Lock()
	client, ok := a.conns.wsClients[connID]
	a.conns.wsClientsMu.Unlock()

	if !ok {
		return fmt.Errorf("WebSocket connection %s not found", connID)
	}
	return client.Send(message)
}

// GetWebSocketMessages returns messages received since the last poll.
func (a *App) GetWebSocketMessages(connID string) ([]websocket.Message, error) {
	a.conns.wsClientsMu.Lock()
	client, ok := a.conns.wsClients[connID]
	a.conns.wsClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("WebSocket connection %s not found", connID)
	}
	return client.MessagesSince(), nil
}

// GetAllWebSocketMessages returns the full message log for restoring state.
func (a *App) GetAllWebSocketMessages(connID string) ([]websocket.Message, error) {
	a.conns.wsClientsMu.Lock()
	client, ok := a.conns.wsClients[connID]
	a.conns.wsClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("WebSocket connection %s not found", connID)
	}
	return client.AllMessages(), nil
}

// GetWebSocketStatus returns the status of an active WebSocket connection.
func (a *App) GetWebSocketStatus(connID string) (map[string]interface{}, error) {
	a.conns.wsClientsMu.Lock()
	client, ok := a.conns.wsClients[connID]
	a.conns.wsClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("WebSocket connection %s not found", connID)
	}
	return client.StatusInfo(), nil
}

// ==================== SSE (Server-Sent Events) ====================

// ConnectSSE creates a new SSE connection and starts reading events.
func (a *App) ConnectSSE(requestID, url string, headers map[string]string) (map[string]interface{}, error) {
	connID := uuid.New().String()

	client := sse.NewClient(connID, url)
	if err := client.Connect(headers); err != nil {
		return nil, err
	}

	a.conns.sseClientsMu.Lock()
	a.conns.sseClients[connID] = client
	a.conns.sseClientsMu.Unlock()

	// Save the SSE request to the collection if requestID is provided
	if requestID != "" {
		req, err := a.git.GetRequest(requestID)
		if err == nil {
			req.URL = url
			req.Headers = headers
			req.Method = "SSE"
			req.UpdatedAt = time.Now()
			_ = a.git.SaveRequest(req)
		}
	}

	return map[string]interface{}{
		"connID": connID,
		"url":    url,
		"status": "connected",
	}, nil
}

// DisconnectSSE closes an active SSE connection.
func (a *App) DisconnectSSE(connID string) error {
	a.conns.sseClientsMu.Lock()
	client, ok := a.conns.sseClients[connID]
	if !ok {
		a.conns.sseClientsMu.Unlock()
		return fmt.Errorf("SSE connection %s not found", connID)
	}
	delete(a.conns.sseClients, connID)
	a.conns.sseClientsMu.Unlock()

	return client.Disconnect()
}

// GetSSEEvents returns SSE events received since the last poll.
func (a *App) GetSSEEvents(connID string) ([]sse.Event, error) {
	a.conns.sseClientsMu.Lock()
	client, ok := a.conns.sseClients[connID]
	a.conns.sseClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("SSE connection %s not found", connID)
	}
	return client.EventsSince(), nil
}

// GetAllSSEEvents returns the full event log for restoring state.
func (a *App) GetAllSSEEvents(connID string) ([]sse.Event, error) {
	a.conns.sseClientsMu.Lock()
	client, ok := a.conns.sseClients[connID]
	a.conns.sseClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("SSE connection %s not found", connID)
	}
	return client.AllEvents(), nil
}

// GetSSEStatus returns the status of an active SSE connection.
func (a *App) GetSSEStatus(connID string) (map[string]interface{}, error) {
	a.conns.sseClientsMu.Lock()
	client, ok := a.conns.sseClients[connID]
	a.conns.sseClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("SSE connection %s not found", connID)
	}
	return client.StatusInfo(), nil
}

// ==================== Storage / Filesystem ====================

// openPath opens a file or directory in the system's default application.
func openPath(p string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", p).Run()
	case "windows":
		return exec.Command("cmd", "/c", "start", "", p).Run()
	default:
		return exec.Command("xdg-open", p).Run()
	}
}

// RevealInFinder opens the collection directory in the system file browser.
func (a *App) RevealInFinder(collectionID string) error {
	dir := a.git.GetCollectionDir(collectionID)
	return openPath(dir)
}

// GetStorageInfo returns metadata about the storage layout.
func (a *App) GetStorageInfo() map[string]string {
	return map[string]string{
		"base_dir": a.git.GetBaseDir(),
		"format":   "git-friendly (directory-per-collection)",
		"schema":   "1",
	}
}

// startTerminalServer runs a dedicated HTTP server for the terminal WebSocket.
// Wails' asset handler wraps ResponseWriter, preventing WebSocket upgrades.
// This separate server bypasses that limitation.
func (a *App) startTerminalServer() {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		slog.Error("terminal server failed to start", "error", err)
		return
	}
	a.termPort = listener.Addr().(*net.TCPAddr).Port
	slog.Info("terminal WebSocket server started", "port", a.termPort)

	secret := MustGenerateTerminalSecret()
	slog.Info("terminal secret generated")

	mux := http.NewServeMux()
	mux.HandleFunc("/terminal/"+secret, HandleTerminalWS)
	http.Serve(listener, mux)
}

// GetTerminalPort returns the port the terminal WebSocket server is running on.
func (a *App) GetTerminalPort() int {
	return a.termPort
}

// ==================== Scripting ====================

// substituteVars replaces {{variable}} placeholders in a string with their
// values from the given map. This is the canonical variable substitution used
// by both the backend ExecuteRequest and the CLI runner.
func substituteVars(s string, vars map[string]string) string {
	for k, v := range vars {
		s = strings.ReplaceAll(s, "{{"+k+"}}", v)
	}
	return s
}

// collectEnvVars gathers environment variables from the active environment.
// Env vars are passed directly to ExecuteRequest by the frontend. This
// function loads the "Script" environment for script chaining scenarios
// where variables set by a pre-request script need to be available to the
// test script (or vice versa).
func (a *App) collectEnvVars() map[string]string {
	env := make(map[string]string)
	envs, err := a.git.GetEnvironments()
	if err != nil {
		return env
	}
	for _, e := range envs {
		if e.Name == "Script" {
			for k, v := range e.Variables {
				env[k] = fmt.Sprintf("%v", v)
			}
			return env
		}
	}
	return env
}

// applyEnvFromScript applies environment variable changes made by scripts
// back to a "Script" environment or the default environment.
func (a *App) applyEnvFromScript(env map[string]string) {
	envs, err := a.git.GetEnvironments()
	if err != nil {
		return
	}

	// Find or create a "Script" environment
	var scriptEnv *models.Environment
	for i := range envs {
		if envs[i].Name == "Script" {
			scriptEnv = &envs[i]
			break
		}
	}

	if scriptEnv == nil {
		scriptEnv = &models.Environment{
			ID:        uuid.New().String(),
			Name:      "Script",
			Variables: make(map[string]interface{}),
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
	}

	for k, v := range env {
		scriptEnv.Variables[k] = v
	}
	scriptEnv.UpdatedAt = time.Now()
	_ = a.git.SaveEnvironment(scriptEnv)
}

// RunPreRequestScript runs a pre-request script and returns the modified request.
func (a *App) RunPreRequestScript(requestID, script string) (*models.HTTPRequest, error) {
	req, err := a.git.GetRequest(requestID)
	if err != nil {
		return nil, err
	}

	env := a.collectEnvVars()

	modified, err := a.scriptEngine.PreRequestScript(script, req, env)
	if err != nil {
		return nil, err
	}

	return modified, nil
}

// RunTestScript executes a test script against a response and returns the result.
func (a *App) RunTestScript(requestID, script string, response map[string]interface{}) *scripting.TestResult {
	req, err := a.git.GetRequest(requestID)
	if err != nil {
		return &scripting.TestResult{
			Passed: false,
			Error:  err.Error(),
		}
	}

	env := a.collectEnvVars()

	result := a.scriptEngine.TestScript(script, req, response, env)

	if len(env) > 0 {
		a.applyEnvFromScript(env)
	}

	return result
}

// SetRequestScripts sets the pre-request and test scripts for a request.
func (a *App) SetRequestScripts(requestID string, preRequestScript string, testScript string) (*models.HTTPRequest, error) {
	req, err := a.git.GetRequest(requestID)
	if err != nil {
		return nil, err
	}

	req.PreRequestScript = preRequestScript
	req.TestScript = testScript
	req.UpdatedAt = time.Now()

	err = a.git.SaveRequest(req)
	if err != nil {
		return nil, err
	}

	return req, nil
}

// GetRequestScripts returns the scripts for a request.
func (a *App) GetRequestScripts(requestID string) (map[string]string, error) {
	req, err := a.git.GetRequest(requestID)
	if err != nil {
		return nil, err
	}

	return map[string]string{
		"pre_request_script": req.PreRequestScript,
		"test_script":        req.TestScript,
	}, nil
}

// ==================== Git Operations ====================

// GitInit initializes a Git repository for a collection.
func (a *App) GitInit(collectionID string) error {
	return gitops.InitRepo(a.git.GetCollectionDir(collectionID))
}

// GitStatus returns the Git status for a collection.
func (a *App) GitStatus(collectionID string) (*gitops.StatusResult, error) {
	return gitops.Status(a.git.GetCollectionDir(collectionID))
}

// GitCommit commits all changes in a collection with the given message.
func (a *App) GitCommit(collectionID, message string) error {
	return gitops.Commit(a.git.GetCollectionDir(collectionID), message)
}

// GitLog returns the commit history for a collection.
func (a *App) GitLog(collectionID string) ([]gitops.CommitEntry, error) {
	return gitops.Log(a.git.GetCollectionDir(collectionID))
}

// GitAddRemote adds a remote to the collection's Git repo.
func (a *App) GitAddRemote(collectionID, name, url string) error {
	return gitops.AddRemote(a.git.GetCollectionDir(collectionID), name, url)
}

// GitPush pushes commits to a remote.
func (a *App) GitPush(collectionID, remote string) error {
	return gitops.Push(a.git.GetCollectionDir(collectionID), remote, "")
}

// GitPull pulls commits from a remote.
func (a *App) GitPull(collectionID, remote string) error {
	return gitops.Pull(a.git.GetCollectionDir(collectionID), remote)
}

// ==================== Terminal ====================

// ExecCommand executes a shell command and returns the output.
// Commands are limited to 10 seconds to prevent hanging.
func (a *App) ExecCommand(command string) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	output, err := cmd.CombinedOutput()

	result := map[string]interface{}{
		"output": string(output),
		"error":  "",
	}

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			result["error"] = "Command timed out after 10s"
		} else {
			result["error"] = err.Error()
		}
	}

	return result, nil
}

// ==================== Mock Server ====================

// StartMockServer starts the built-in mock HTTP server on the given port.
// After starting, it automatically loads all saved mock configs from all collections.
func (a *App) StartMockServer(port int) error {
	if port < 1 || port > 65535 {
		return fmt.Errorf("invalid port %d: must be between 1 and 65535", port)
	}
	if err := a.mockServer.Start(port); err != nil {
		return err
	}

	// Auto-load all saved mock configs on server start
	cols, err := a.git.GetCollections()
	if err != nil {
		slog.Warn("mock: could not load collections", "error", err)
		return nil
	}
	for _, col := range cols {
		configs, err := a.git.GetMockConfigs(col.ID)
		if err != nil {
			continue
		}
		for _, mc := range configs {
			a.mockServer.SetHandler(mc)
		}
	}
	slog.Info("mock handlers loaded from disk", "count", len(a.mockServer.Status().Handlers))
	return nil
}

// StopMockServer gracefully stops the mock server.
func (a *App) StopMockServer() error {
	return a.mockServer.Stop()
}

// Shutdown is called by Wails when the app is closing.
// It ensures the mock server stops gracefully.
func (a *App) Shutdown() {
	slog.Info("shutting down")
	_ = a.mockServer.Stop()

	// Disconnect all active WebSocket clients
	a.conns.wsClientsMu.Lock()
	for id, c := range a.conns.wsClients {
		_ = c.Disconnect()
		delete(a.conns.wsClients, id)
	}
	a.conns.wsClientsMu.Unlock()

	// Disconnect all active SSE clients
	a.conns.sseClientsMu.Lock()
	for id, c := range a.conns.sseClients {
		_ = c.Disconnect()
		delete(a.conns.sseClients, id)
	}
	a.conns.sseClientsMu.Unlock()
}

// SetMockConfig adds or updates a mock response configuration for a request.
// The body, statusCode, headers, and latencyMs define what the mock server returns.
func (a *App) SetMockConfig(requestID string, statusCode int, headers map[string]string, body string, latencyMs int, enabled bool) (*models.MockConfig, error) {
	req, err := a.git.GetRequest(requestID)
	if err != nil {
		return nil, err
	}

	// Derive path from the request URL
	u, err := url.Parse(req.URL)
	if err != nil {
		return nil, fmt.Errorf("invalid request URL: %w", err)
	}

	mc := &models.MockConfig{
		RequestID:  requestID,
		Method:     req.Method,
		Path:       u.Path,
		StatusCode: statusCode,
		Headers:    headers,
		Body:       body,
		LatencyMs:  latencyMs,
		Enabled:    enabled,
	}

	// Persist to disk
	if err := a.git.SaveMockConfig(mc); err != nil {
		return nil, err
	}

	// Register with the running server
	a.mockServer.SetHandler(*mc)

	return mc, nil
}

// RemoveMockConfig removes a mock configuration for a request.
// Looks up the owning collection via the request's CollectionID for O(1) deletion.
func (a *App) RemoveMockConfig(requestID string) error {
	if req, err := a.git.GetRequest(requestID); err == nil && req.CollectionID != "" {
		_ = a.git.DeleteMockConfig(req.CollectionID, requestID)
	}
	a.mockServer.RemoveHandler(requestID)
	return nil
}

// GetMockStatus returns the current state of the mock server (running, port, handlers).
func (a *App) GetMockStatus() *models.MockStatus {
	status := a.mockServer.Status()
	return &status
}

// LoadMockConfigs loads all saved mock configs for a collection and registers them with the server.
// SetHandler is called for every config — disabled ones get evicted from the running set.
func (a *App) LoadMockConfigs(collectionID string) ([]models.MockConfig, error) {
	configs, err := a.git.GetMockConfigs(collectionID)
	if err != nil {
		return nil, err
	}
	for _, mc := range configs {
		a.mockServer.SetHandler(mc)
	}
	return configs, nil
}

// GetMockLog returns the recent request log from the mock server, newest first.
func (a *App) GetMockLog() []mock.LogEntry {
	return a.mockServer.Log()
}

// ClearMockLog empties the mock server's in-memory request log.
func (a *App) ClearMockLog() {
	a.mockServer.ClearLog()
}
