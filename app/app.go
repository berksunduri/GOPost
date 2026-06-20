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
	"gopost/app/pkg/storage"
	"gopost/app/pkg/websocket"
)

// App struct
type App struct {
	ctx           context.Context
	git           *storage.GitStore // Git-friendly storage
	termPort      int               // Port for terminal WebSocket server
	scriptEngine  *scripting.Engine // Starlark scripting engine
	httpClient    *http.Client      // Shared HTTP client with connection pooling
	mockServer    *mock.Server      // Built-in mock server
	schemaCacheMu sync.RWMutex
	schemaCache   map[string]*models.CachedGraphQLSchema // URL → cached schema

	wsClientsMu sync.Mutex
	wsClients   map[string]*websocket.Client // connID → active WS client

	sseClientsMu sync.Mutex
	sseClients   map[string]*sse.Client // connID → active SSE client
}

// NewApp creates a new App application struct.
// Automatically migrates legacy data to Git-friendly format on first run.
func NewApp(dataDir string) *App {
	// Run migration from legacy JSON blobs to per-file GitStore
	migrated, err := storage.MigrateFromLegacy(dataDir)
	if err != nil {
		slog.Warn("migration warning", "error", err)
	}
	if migrated {
		slog.Info("data migrated to Git-friendly format")
		slog.Info("old files backed up as .legacy.bak")
	}

	gitStore, err := storage.NewGitStore(dataDir)
	if err != nil {
		slog.Error("failed to initialize storage", "error", err)
		// Continue with minimal app — storage will be unavailable.
	}

	return &App{
		git:          gitStore,
		scriptEngine: scripting.NewEngine(), // Starlark scripting engine
		httpClient:   newSharedHTTPClient(), // Pooled HTTP client
		mockServer:   mock.NewServer(),      // Built-in mock server
		schemaCache:  make(map[string]*models.CachedGraphQLSchema),
		wsClients:    make(map[string]*websocket.Client),
		sseClients:   make(map[string]*sse.Client),
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
func (a *App) CreateRequest(collectionID string, name string, method string, url string, headers map[string]string, body string, description string) (*models.HTTPRequest, error) {
	if headers == nil {
		headers = make(map[string]string)
	}

	request := &models.HTTPRequest{
		ID:           uuid.New().String(),
		Name:         name,
		Method:       method,
		URL:          url,
		Headers:      headers,
		Auth:         models.RequestAuth{Type: "none"},
		Body:         body,
		Description:  description,
		CollectionID: collectionID,
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
func (a *App) UpdateRequest(id string, name string, method string, url string, headers map[string]string, body string, description string) (*models.HTTPRequest, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}

	request.Name = name
	request.Method = method
	request.URL = url
	request.Headers = headers
	request.Body = body
	request.Description = description
	request.UpdatedAt = time.Now()

	err = a.git.SaveRequest(request)
	if err != nil {
		return nil, err
	}

	return request, nil
}

func (a *App) SetRequestAuth(id string, authType string, token string, username string, password string, apiKey string, apiKeyValue string, apiKeyIn string) (*models.HTTPRequest, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}
	request.Auth = models.RequestAuth{
		Type:        authType,
		Token:       token,
		Username:    username,
		Password:    password,
		APIKey:      apiKey,
		APIKeyValue: apiKeyValue,
		APIKeyIn:    apiKeyIn,
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
func (a *App) ExecuteRequest(id string, envVars map[string]string) (map[string]interface{}, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}

	// Apply environment variable substitution to URL, body, and headers.
	// This is the single source of truth — the frontend saves raw templates.
	if len(envVars) > 0 {
		request.URL = substituteVars(request.URL, envVars)
		request.Body = substituteVars(request.Body, envVars)
		substitutedHeaders := make(map[string]string, len(request.Headers))
		for k, v := range request.Headers {
			substitutedHeaders[substituteVars(k, envVars)] = substituteVars(v, envVars)
		}
		request.Headers = substitutedHeaders
	}

	// Script env is mainly for chaining between pre-request and test scripts.
	env := envVars
	if env == nil {
		env = make(map[string]string)
	}

	// Run pre-request script
	if request.PreRequestScript != "" {
		modified, err := a.scriptEngine.PreRequestScript(request.PreRequestScript, request, env)
		if err != nil {
			return map[string]interface{}{
				"error":         err.Error(),
				"script_phase":  "pre-request",
				"script_failed": true,
			}, nil
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

	result := map[string]interface{}{
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
		result["test_result"] = map[string]interface{}{
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

// SaveUserConfig persists user preferences
func (a *App) SaveUserConfig(cfg *models.UserConfig) (map[string]bool, error) {
	err := a.git.SaveUserConfig(cfg)
	return map[string]bool{"ok": true}, err
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
			request, reqErr := a.CreateRequest(entry.CollectionID, entry.RequestName, entry.Method, entry.URL, entry.RequestHeaders, entry.RequestBody, "Replayed from history")
			if reqErr != nil {
				return nil, reqErr
			}
			_, _ = a.SetRequestAuth(request.ID, entry.RequestAuth.Type, entry.RequestAuth.Token, entry.RequestAuth.Username, entry.RequestAuth.Password, entry.RequestAuth.APIKey, entry.RequestAuth.APIKeyValue, entry.RequestAuth.APIKeyIn)
			return a.ExecuteRequest(request.ID, nil)
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
		req, err := a.CreateRequest(collectionID, name, pr.Method, pr.URL, pr.Headers, pr.Body, "")
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

	home, _ := os.UserHomeDir()
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
		result, execErr := a.ExecuteRequest(request.ID, nil)
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
	a.schemaCacheMu.RLock()
	if cached, ok := a.schemaCache[endpointURL]; ok {
		a.schemaCacheMu.RUnlock()
		return cached.Schema, nil
	}
	a.schemaCacheMu.RUnlock()

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
	a.schemaCacheMu.Lock()
	const maxSchemaCache = 50
	if len(a.schemaCache) >= maxSchemaCache {
		var oldestURL string
		var oldestTime time.Time
		for u, c := range a.schemaCache {
			if oldestURL == "" || c.IntrospectedAt.Before(oldestTime) {
				oldestURL = u
				oldestTime = c.IntrospectedAt
			}
		}
		delete(a.schemaCache, oldestURL)
	}
	a.schemaCache[endpointURL] = &models.CachedGraphQLSchema{
		URL:            endpointURL,
		Schema:         result,
		IntrospectedAt: time.Now(),
	}
	a.schemaCacheMu.Unlock()

	return result, nil
}

// GetCachedGraphQLSchema returns a previously introspected schema.
func (a *App) GetCachedGraphQLSchema(url string) (map[string]interface{}, error) {
	a.schemaCacheMu.RLock()
	defer a.schemaCacheMu.RUnlock()
	cached, ok := a.schemaCache[url]
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
func (a *App) UpdateRequestWithGraphQL(id string, name string, method string, url string, headers map[string]string, body string, description string, graphqlQuery string, graphqlVariables string, graphqlOperationName string, graphqlSchemaURL string) (*models.HTTPRequest, error) {
	request, err := a.git.GetRequest(id)
	if err != nil {
		return nil, err
	}

	request.Name = name
	request.Method = method
	request.URL = url
	request.Headers = headers
	request.Body = body
	request.Description = description
	request.UpdatedAt = time.Now()

	if method == "GRAPHQL" && graphqlQuery != "" {
		if request.GraphQL == nil {
			request.GraphQL = &models.GraphQLPayload{}
		}
		request.GraphQL.Query = graphqlQuery
		request.GraphQL.Variables = graphqlVariables
		request.GraphQL.OperationName = graphqlOperationName
		request.GraphQL.SchemaURL = graphqlSchemaURL
	} else if method != "GRAPHQL" {
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

	a.wsClientsMu.Lock()
	a.wsClients[connID] = client
	a.wsClientsMu.Unlock()

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
	a.wsClientsMu.Lock()
	client, ok := a.wsClients[connID]
	if !ok {
		a.wsClientsMu.Unlock()
		return fmt.Errorf("WebSocket connection %s not found", connID)
	}
	delete(a.wsClients, connID)
	a.wsClientsMu.Unlock()

	return client.Disconnect()
}

// SendWebSocketMessage sends a text message through an active WebSocket connection.
func (a *App) SendWebSocketMessage(connID, message string) error {
	a.wsClientsMu.Lock()
	client, ok := a.wsClients[connID]
	a.wsClientsMu.Unlock()

	if !ok {
		return fmt.Errorf("WebSocket connection %s not found", connID)
	}
	return client.Send(message)
}

// GetWebSocketMessages returns messages received since the last poll.
func (a *App) GetWebSocketMessages(connID string) ([]websocket.Message, error) {
	a.wsClientsMu.Lock()
	client, ok := a.wsClients[connID]
	a.wsClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("WebSocket connection %s not found", connID)
	}
	return client.MessagesSince(), nil
}

// GetAllWebSocketMessages returns the full message log for restoring state.
func (a *App) GetAllWebSocketMessages(connID string) ([]websocket.Message, error) {
	a.wsClientsMu.Lock()
	client, ok := a.wsClients[connID]
	a.wsClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("WebSocket connection %s not found", connID)
	}
	return client.AllMessages(), nil
}

// GetWebSocketStatus returns the status of an active WebSocket connection.
func (a *App) GetWebSocketStatus(connID string) (map[string]interface{}, error) {
	a.wsClientsMu.Lock()
	client, ok := a.wsClients[connID]
	a.wsClientsMu.Unlock()

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

	a.sseClientsMu.Lock()
	a.sseClients[connID] = client
	a.sseClientsMu.Unlock()

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
	a.sseClientsMu.Lock()
	client, ok := a.sseClients[connID]
	if !ok {
		a.sseClientsMu.Unlock()
		return fmt.Errorf("SSE connection %s not found", connID)
	}
	delete(a.sseClients, connID)
	a.sseClientsMu.Unlock()

	return client.Disconnect()
}

// GetSSEEvents returns SSE events received since the last poll.
func (a *App) GetSSEEvents(connID string) ([]sse.Event, error) {
	a.sseClientsMu.Lock()
	client, ok := a.sseClients[connID]
	a.sseClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("SSE connection %s not found", connID)
	}
	return client.EventsSince(), nil
}

// GetAllSSEEvents returns the full event log for restoring state.
func (a *App) GetAllSSEEvents(connID string) ([]sse.Event, error) {
	a.sseClientsMu.Lock()
	client, ok := a.sseClients[connID]
	a.sseClientsMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("SSE connection %s not found", connID)
	}
	return client.AllEvents(), nil
}

// GetSSEStatus returns the status of an active SSE connection.
func (a *App) GetSSEStatus(connID string) (map[string]interface{}, error) {
	a.sseClientsMu.Lock()
	client, ok := a.sseClients[connID]
	a.sseClientsMu.Unlock()

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

	mux := http.NewServeMux()
	mux.HandleFunc("/terminal", HandleTerminalWS)
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
// Env vars are now passed directly to ExecuteRequest by the frontend. This
// function is retained for script chaining scenarios.
func (a *App) collectEnvVars() map[string]string {
	env := make(map[string]string)
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
	a.wsClientsMu.Lock()
	for id, c := range a.wsClients {
		_ = c.Disconnect()
		delete(a.wsClients, id)
	}
	a.wsClientsMu.Unlock()

	// Disconnect all active SSE clients
	a.sseClientsMu.Lock()
	for id, c := range a.sseClients {
		_ = c.Disconnect()
		delete(a.sseClients, id)
	}
	a.sseClientsMu.Unlock()
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
