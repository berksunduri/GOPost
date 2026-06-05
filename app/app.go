package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"

	"gopost/app/pkg/models"
	"gopost/app/pkg/storage"
)

// App struct
type App struct {
	ctx     context.Context
	storage *storage.Storage
}

// NewApp creates a new App application struct
func NewApp(dataDir string) *App {
	return &App{
		storage: storage.New(dataDir),
	}
}

// ServiceStartup is called when the Wails service starts
func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.ctx = ctx
	return nil
}

// ==================== Collections ====================

// GetCollections returns all collections
func (a *App) GetCollections() ([]models.Collection, error) {
	return a.storage.GetCollections()
}

// CreateCollection creates a new collection
func (a *App) CreateCollection(name string) (*models.Collection, error) {
	collection := &models.Collection{
		ID:        uuid.New().String(),
		Name:      name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err := a.storage.SaveCollection(collection)
	if err != nil {
		return nil, err
	}

	return collection, nil
}

// UpdateCollection updates an existing collection
func (a *App) UpdateCollection(id string, name string) (*models.Collection, error) {
	collection, err := a.storage.GetCollection(id)
	if err != nil {
		return nil, err
	}

	collection.Name = name
	collection.UpdatedAt = time.Now()

	err = a.storage.SaveCollection(collection)
	if err != nil {
		return nil, err
	}

	return collection, nil
}

// DeleteCollection deletes a collection
func (a *App) DeleteCollection(id string) (map[string]bool, error) {
	err := a.storage.DeleteCollection(id)
	return map[string]bool{"ok": true}, err
}

// ==================== Requests ====================

// GetRequestsForCollection returns all requests in a collection
func (a *App) GetRequestsForCollection(collectionID string) ([]models.HTTPRequest, error) {
	return a.storage.GetRequests(collectionID)
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

	err := a.storage.SaveRequest(request)
	if err != nil {
		return nil, err
	}

	return request, nil
}

func (a *App) DuplicateRequest(id string) (*models.HTTPRequest, error) {
	request, err := a.storage.GetRequest(id)
	if err != nil {
		return nil, err
	}
	request.ID = uuid.New().String()
	request.Name = request.Name + " Copy"
	request.CreatedAt = time.Now()
	request.UpdatedAt = time.Now()
	if err := a.storage.SaveRequest(request); err != nil {
		return nil, err
	}
	return request, nil
}

func (a *App) MoveRequest(id string, collectionID string) (*models.HTTPRequest, error) {
	request, err := a.storage.GetRequest(id)
	if err != nil {
		return nil, err
	}
	request.CollectionID = collectionID
	request.UpdatedAt = time.Now()
	if err := a.storage.SaveRequest(request); err != nil {
		return nil, err
	}
	return request, nil
}

func (a *App) SearchRequests(query string) ([]models.HTTPRequest, error) {
	requests, err := a.storage.GetAllRequests()
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
	request, err := a.storage.GetRequest(id)
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

	err = a.storage.SaveRequest(request)
	if err != nil {
		return nil, err
	}

	return request, nil
}

func (a *App) SetRequestAuth(id string, authType string, token string, username string, password string, apiKey string, apiKeyValue string, apiKeyIn string) (*models.HTTPRequest, error) {
	request, err := a.storage.GetRequest(id)
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
	if err := a.storage.SaveRequest(request); err != nil {
		return nil, err
	}
	return request, nil
}

// DeleteRequest deletes a request
func (a *App) DeleteRequest(id string) (map[string]bool, error) {
	err := a.storage.DeleteRequest(id)
	return map[string]bool{"ok": true}, err
}

// ExecuteRequest executes an HTTP request and returns the response
func (a *App) ExecuteRequest(id string) (map[string]interface{}, error) {
	request, err := a.storage.GetRequest(id)
	if err != nil {
		return nil, err
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
	client := &http.Client{Timeout: 30 * time.Second}
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

	collections, _ := a.storage.GetCollections()
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
	_ = a.storage.SaveHistoryEntry(entry)

	return result, nil
}

// ==================== Environments ====================

// GetEnvironments returns all environments
func (a *App) GetEnvironments() ([]models.Environment, error) {
	return a.storage.GetEnvironments()
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

	err := a.storage.SaveEnvironment(environment)
	if err != nil {
		return nil, err
	}

	return environment, nil
}

// UpdateEnvironment updates an environment
func (a *App) UpdateEnvironment(id string, name string, variables map[string]interface{}) (*models.Environment, error) {
	environment, err := a.storage.GetEnvironment(id)
	if err != nil {
		return nil, err
	}

	environment.Name = name
	environment.Variables = variables
	environment.UpdatedAt = time.Now()

	err = a.storage.SaveEnvironment(environment)
	if err != nil {
		return nil, err
	}

	return environment, nil
}

// DeleteEnvironment deletes an environment
func (a *App) DeleteEnvironment(id string) (map[string]bool, error) {
	err := a.storage.DeleteEnvironment(id)
	return map[string]bool{"ok": true}, err
}

func (a *App) GetHistory() ([]models.HistoryEntry, error) {
	return a.storage.GetHistory()
}

func (a *App) ReplayHistoryEntry(entryID string) (map[string]interface{}, error) {
	history, err := a.storage.GetHistory()
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
			return a.ExecuteRequest(request.ID)
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
	return os.WriteFile(filePath, raw, 0644)
}

func (a *App) ExportSnapshot() (*models.ExportData, error) {
	collections, err := a.storage.GetCollections()
	if err != nil {
		return nil, err
	}
	requests, err := a.storage.GetAllRequests()
	if err != nil {
		return nil, err
	}
	environments, err := a.storage.GetEnvironments()
	if err != nil {
		return nil, err
	}
	history, err := a.storage.GetHistory()
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
	return a.storage.ReplaceAllData(&data)
}

func (a *App) MergeSnapshot(data models.ExportData) error {
	if data.Version != 1 {
		return fmt.Errorf("unsupported import version: %d", data.Version)
	}
	existingCollections, err := a.storage.GetCollections()
	if err != nil {
		return err
	}
	existingRequests, err := a.storage.GetAllRequests()
	if err != nil {
		return err
	}
	existingEnvironments, err := a.storage.GetEnvironments()
	if err != nil {
		return err
	}
	existingHistory, err := a.storage.GetHistory()
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
	return a.storage.ReplaceAllData(&merged)
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
	requests, err := a.storage.GetRequests(collectionID)
	if err != nil {
		return nil, err
	}
	results := make([]map[string]interface{}, 0, len(requests))
	passed := 0
	failed := 0
	for _, request := range requests {
		result, execErr := a.ExecuteRequest(request.ID)
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
	return map[string]interface{}{
		"collection_id": collectionID,
		"total":         len(results),
		"passed":        passed,
		"failed":        failed,
		"results":       results,
	}, nil
}
