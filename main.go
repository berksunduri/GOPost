package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"gopost/app"
	"gopost/app/pkg/models"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

// version is set at build time via -ldflags "-X main.version=..."
var version = "dev"

func main() {
	// Get app data directory
	homeDir, _ := os.UserHomeDir()
	appDataDir := filepath.Join(homeDir, ".gopost")
	os.MkdirAll(appDataDir, 0700)

	// Configure structured logging: JSON to file, text to stderr in dev.
	logFile, err := os.OpenFile(filepath.Join(appDataDir, "gopost.log"),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err == nil {
		defer logFile.Close()
		fileHandler := slog.NewJSONHandler(logFile, &slog.HandlerOptions{Level: slog.LevelInfo})
		stderrHandler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
		slog.SetDefault(slog.New(&multiHandler{handlers: []slog.Handler{fileHandler, stderrHandler}}))
	} else {
		slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})))
	}

	// Create app
	appInstance := app.NewApp(appDataDir)

	distFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		slog.Error("failed to embed frontend assets", "error", err)
		os.Exit(1)
	}

	staticHandler := http.FileServer(http.FS(distFS))
	assetHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			handleAPI(appInstance, w, r)
			return
		}
		staticHandler.ServeHTTP(w, r)
	})

	// Create Wails application
	wailsApp := application.New(application.Options{
		Name:        "GoPost",
		Description: "GoPost - Postman clone built with Go and Wails",
		Assets: application.AssetOptions{
			Handler: assetHandler,
		},
		Services: []application.Service{
			application.NewService(appInstance),
		},
	})

	// Register graceful shutdown hook for mock server cleanup
	wailsApp.OnShutdown(func() { appInstance.Shutdown() })

	// Create the app window
	wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "GoPost",
		Width:  1400,
		Height: 900,
		URL:    "/",
	}).Show()

	err = wailsApp.Run()
	if err != nil {
		slog.Error("failed to start application", "error", err)
		os.Exit(1)
	}
}

// multiHandler dispatches log records to multiple slog.Handler implementations.
type multiHandler struct {
	handlers []slog.Handler
}

func (m *multiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range m.handlers {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (m *multiHandler) Handle(ctx context.Context, r slog.Record) error {
	for _, h := range m.handlers {
		if err := h.Handle(ctx, r.Clone()); err != nil {
			return err
		}
	}
	return nil
}

func (m *multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	h := &multiHandler{}
	for _, handler := range m.handlers {
		h.handlers = append(h.handlers, handler.WithAttrs(attrs))
	}
	return h
}

func (m *multiHandler) WithGroup(name string) slog.Handler {
	h := &multiHandler{}
	for _, handler := range m.handlers {
		h.handlers = append(h.handlers, handler.WithGroup(name))
	}
	return h
}

func handleAPI(appInstance *app.App, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/api/collections":
		data, err := appInstance.GetCollections()
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && r.URL.Path == "/api/collections":
		var payload struct {
			Name string `json:"name"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.CreateCollection(payload.Name)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/collections/"):
		id := strings.TrimPrefix(r.URL.Path, "/api/collections/")
		data, err := appInstance.DeleteCollection(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/api/collections/"):
		id := strings.TrimPrefix(r.URL.Path, "/api/collections/")
		var payload struct {
			Name string `json:"name"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.UpdateCollection(id, payload.Name)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/collections/") && strings.HasSuffix(r.URL.Path, "/requests"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/collections/"), "/requests")
		data, err := appInstance.GetRequestsForCollection(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/collections/") && strings.HasSuffix(r.URL.Path, "/requests"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/collections/"), "/requests")
		var payload struct {
			Name        string            `json:"name"`
			Method      string            `json:"method"`
			URL         string            `json:"url"`
			Headers     map[string]string `json:"headers"`
			Body        string            `json:"body"`
			Description string            `json:"description"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.CreateRequest(id, payload.Name, payload.Method, payload.URL, payload.Headers, payload.Body, payload.Description)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/collections/") && strings.HasSuffix(r.URL.Path, "/import-http"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/collections/"), "/import-http")
		var payload struct {
			Content string `json:"content"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.ImportHTTPContent(payload.Content, id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/collections/") && strings.HasSuffix(r.URL.Path, "/export-http"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/collections/"), "/export-http")
		data, err := appInstance.ExportCollectionAsHTTPContent(id)
		writeJSON(w, map[string]string{"content": data}, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/collections/") && strings.HasSuffix(r.URL.Path, "/export-http-file"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/collections/"), "/export-http-file")
		data, err := appInstance.ExportCollectionAsHTTPFile(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/collections/") && strings.HasSuffix(r.URL.Path, "/run"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/collections/"), "/run")
		var payload struct {
			StopOnFail bool `json:"stopOnFail"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.RunCollection(id, payload.StopOnFail)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/api/requests/"):
		// Specific PUT sub-routes first
		if strings.HasSuffix(r.URL.Path, "/move") {
			id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/requests/"), "/move")
			var payload struct {
				CollectionID string `json:"collection_id"`
			}
			if err := decodeJSON(r, &payload); err != nil {
				writeJSON(w, nil, err)
				return
			}
			data, err := appInstance.MoveRequest(id, payload.CollectionID)
			writeJSON(w, data, err)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/graphql") {
			id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/requests/"), "/graphql")
			var payload struct {
				Query         string `json:"query"`
				Variables     string `json:"variables"`
				OperationName string `json:"operationName"`
				SchemaURL     string `json:"schemaURL"`
			}
			if err := decodeJSON(r, &payload); err != nil {
				writeJSON(w, nil, err)
				return
			}
			data, err := appInstance.SetRequestGraphQL(id, payload.Query, payload.Variables, payload.OperationName, payload.SchemaURL)
			writeJSON(w, data, err)
			return
		}
		// Generic PUT — update request
		id := strings.TrimPrefix(r.URL.Path, "/api/requests/")
		var payload struct {
			Name        string            `json:"name"`
			Method      string            `json:"method"`
			URL         string            `json:"url"`
			Headers     map[string]string `json:"headers"`
			Body        string            `json:"body"`
			Description string            `json:"description"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.UpdateRequest(id, payload.Name, payload.Method, payload.URL, payload.Headers, payload.Body, payload.Description)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/requests/"):
		id := strings.TrimPrefix(r.URL.Path, "/api/requests/")
		data, err := appInstance.DeleteRequest(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/requests/") && strings.HasSuffix(r.URL.Path, "/execute"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/requests/"), "/execute")
		var payload struct {
			EnvVars map[string]string `json:"envVars"`
		}
		decodeJSON(r, &payload)
		data, err := appInstance.ExecuteRequest(id, payload.EnvVars)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/requests/") && strings.HasSuffix(r.URL.Path, "/auth"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/requests/"), "/auth")
		var payload struct {
			AuthType    string `json:"authType"`
			Token       string `json:"token"`
			Username    string `json:"username"`
			Password    string `json:"password"`
			APIKey      string `json:"apiKey"`
			APIKeyValue string `json:"apiKeyValue"`
			APIKeyIn    string `json:"apiKeyIn"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.SetRequestAuth(id, payload.AuthType, payload.Token, payload.Username, payload.Password, payload.APIKey, payload.APIKeyValue, payload.APIKeyIn)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/requests/") && strings.HasSuffix(r.URL.Path, "/duplicate"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/requests/"), "/duplicate")
		data, err := appInstance.DuplicateRequest(id)
		writeJSON(w, data, err)
		return

	// GraphQL request sub-routes (must come before generic request handlers)
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/requests/") && strings.HasSuffix(r.URL.Path, "/execute-graphql"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/requests/"), "/execute-graphql")
		data, err := appInstance.ExecuteGraphQLRequest(id)
		writeJSON(w, data, err)
		return

	case r.Method == http.MethodGet && r.URL.Path == "/api/requests/search":
		data, err := appInstance.SearchRequests(r.URL.Query().Get("q"))
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/requests/") && !strings.Contains(r.URL.Path[13:], "/"):
		id := strings.TrimPrefix(r.URL.Path, "/api/requests/")
		data, err := appInstance.GetRequest(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/environments":
		data, err := appInstance.GetEnvironments()
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && r.URL.Path == "/api/environments":
		var payload struct {
			Name      string                 `json:"name"`
			Variables map[string]interface{} `json:"variables"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.CreateEnvironment(payload.Name, payload.Variables)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/environments/"):
		id := strings.TrimPrefix(r.URL.Path, "/api/environments/")
		data, err := appInstance.DeleteEnvironment(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/api/environments/"):
		id := strings.TrimPrefix(r.URL.Path, "/api/environments/")
		var payload struct {
			Name      string                 `json:"name"`
			Variables map[string]interface{} `json:"variables"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.UpdateEnvironment(id, payload.Name, payload.Variables)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/history":
		data, err := appInstance.GetHistory()
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/history/") && strings.HasSuffix(r.URL.Path, "/replay"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/history/"), "/replay")
		data, err := appInstance.ReplayHistoryEntry(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/user-config":
		data, err := appInstance.GetUserConfig()
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPut && r.URL.Path == "/api/user-config":
		var cfg models.UserConfig
		if err := decodeJSON(r, &cfg); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.SaveUserConfig(&cfg)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/runs/"):
		id := strings.TrimPrefix(r.URL.Path, "/api/runs/")
		data, err := appInstance.GetRunHistory(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/export-content":
		data, err := appInstance.ExportSnapshot()
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && r.URL.Path == "/api/import-content":
		var payload struct {
			Data models.ExportData `json:"data"`
			Mode string            `json:"mode"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		switch payload.Mode {
		case "replace", "":
			writeJSON(w, map[string]bool{"ok": true}, appInstance.ImportSnapshot(payload.Data))
		case "merge":
			writeJSON(w, map[string]bool{"ok": true}, appInstance.MergeSnapshot(payload.Data))
		case "preview":
			writeJSON(w, map[string]interface{}{
				"ok":           true,
				"collections":  len(payload.Data.Collections),
				"requests":     len(payload.Data.Requests),
				"environments": len(payload.Data.Environments),
				"history":      len(payload.Data.History),
			}, nil)
		default:
			writeJSON(w, nil, errInvalidMode(payload.Mode))
		}
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/collections/") && strings.HasSuffix(r.URL.Path, "/reveal"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/collections/"), "/reveal")
		err := appInstance.RevealInFinder(id)
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/storage-info":
		writeJSON(w, appInstance.GetStorageInfo(), nil)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/term-port":
		writeJSON(w, map[string]int{"port": appInstance.GetTerminalPort()}, nil)
		return

	// GraphQL introspection
	case r.Method == http.MethodPost && r.URL.Path == "/api/graphql/introspect":
		var payload struct {
			URL string `json:"url"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.IntrospectGraphQLSchema(payload.URL)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/graphql/schema":
		data, err := appInstance.GetCachedGraphQLSchema(r.URL.Query().Get("url"))
		writeJSON(w, data, err)
		return

	// Git
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/git/") && strings.HasSuffix(r.URL.Path, "/init"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/git/"), "/init")
		writeJSON(w, map[string]bool{"ok": true}, appInstance.GitInit(id))
		return
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/git/") && strings.HasSuffix(r.URL.Path, "/status"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/git/"), "/status")
		data, err := appInstance.GitStatus(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/git/") && strings.HasSuffix(r.URL.Path, "/commit"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/git/"), "/commit")
		var payload struct {
			Message string `json:"message"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		writeJSON(w, map[string]bool{"ok": true}, appInstance.GitCommit(id, payload.Message))
		return
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/git/") && strings.HasSuffix(r.URL.Path, "/log"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/git/"), "/log")
		data, err := appInstance.GitLog(id)
		writeJSON(w, data, err)
		return

	// WebSocket operations
	case r.Method == http.MethodPost && r.URL.Path == "/api/ws/connect":
		var payload struct {
			RequestID string            `json:"requestId"`
			URL       string            `json:"url"`
			Headers   map[string]string `json:"headers"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.ConnectWebSocket(payload.RequestID, payload.URL, payload.Headers)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && r.URL.Path == "/api/ws/disconnect":
		var payload struct {
			ConnID string `json:"connId"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		err := appInstance.DisconnectWebSocket(payload.ConnID)
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
		return
	case r.Method == http.MethodPost && r.URL.Path == "/api/ws/send":
		var payload struct {
			ConnID  string `json:"connId"`
			Message string `json:"message"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		err := appInstance.SendWebSocketMessage(payload.ConnID, payload.Message)
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/ws/messages":
		connID := r.URL.Query().Get("connId")
		data, err := appInstance.GetWebSocketMessages(connID)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/ws/messages/all":
		connID := r.URL.Query().Get("connId")
		data, err := appInstance.GetAllWebSocketMessages(connID)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/ws/status":
		connID := r.URL.Query().Get("connId")
		data, err := appInstance.GetWebSocketStatus(connID)
		writeJSON(w, data, err)
		return

	// SSE operations
	case r.Method == http.MethodPost && r.URL.Path == "/api/sse/connect":
		var payload struct {
			RequestID string            `json:"requestId"`
			URL       string            `json:"url"`
			Headers   map[string]string `json:"headers"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.ConnectSSE(payload.RequestID, payload.URL, payload.Headers)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && r.URL.Path == "/api/sse/disconnect":
		var payload struct {
			ConnID string `json:"connId"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		err := appInstance.DisconnectSSE(payload.ConnID)
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/sse/events":
		connID := r.URL.Query().Get("connId")
		data, err := appInstance.GetSSEEvents(connID)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/sse/events/all":
		connID := r.URL.Query().Get("connId")
		data, err := appInstance.GetAllSSEEvents(connID)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/sse/status":
		connID := r.URL.Query().Get("connId")
		data, err := appInstance.GetSSEStatus(connID)
		writeJSON(w, data, err)
		return

	// Scripting operations
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/scripts/") && strings.HasSuffix(r.URL.Path, "/get"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/scripts/"), "/get")
		data, err := appInstance.GetRequestScripts(id)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/api/scripts/") && strings.HasSuffix(r.URL.Path, "/set"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/scripts/"), "/set")
		var payload struct {
			PreRequestScript string `json:"preRequestScript"`
			TestScript       string `json:"testScript"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.SetRequestScripts(id, payload.PreRequestScript, payload.TestScript)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/scripts/") && strings.HasSuffix(r.URL.Path, "/pre-request"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/scripts/"), "/pre-request")
		var payload struct {
			Script string `json:"script"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.RunPreRequestScript(id, payload.Script)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/scripts/") && strings.HasSuffix(r.URL.Path, "/test"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/scripts/"), "/test")
		var payload struct {
			Script   string                 `json:"script"`
			Response map[string]interface{} `json:"response"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data := appInstance.RunTestScript(id, payload.Script, payload.Response)
		writeJSON(w, data, nil)
		return

	// Mock server operations
	case r.Method == http.MethodPost && r.URL.Path == "/api/mock/start":
		var payload struct {
			Port int `json:"port"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		if payload.Port == 0 {
			payload.Port = 3001
		}
		err := appInstance.StartMockServer(payload.Port)
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
		return
	case r.Method == http.MethodPost && r.URL.Path == "/api/mock/stop":
		err := appInstance.StopMockServer()
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/mock/status":
		data := appInstance.GetMockStatus()
		writeJSON(w, data, nil)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/mock/log":
		writeJSON(w, appInstance.GetMockLog(), nil)
		return
	case r.Method == http.MethodDelete && r.URL.Path == "/api/mock/log":
		appInstance.ClearMockLog()
		writeJSON(w, map[string]bool{"ok": true}, nil)
		return
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/mock/config") && strings.HasSuffix(r.URL.Path, "/set"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/mock/config/"), "/set")
		var payload struct {
			StatusCode int               `json:"statusCode"`
			Headers    map[string]string `json:"headers"`
			Body       string            `json:"body"`
			LatencyMs  int               `json:"latencyMs"`
			Enabled    bool              `json:"enabled"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		if payload.StatusCode == 0 {
			payload.StatusCode = 200
		}
		data, err := appInstance.SetMockConfig(id, payload.StatusCode, payload.Headers, payload.Body, payload.LatencyMs, payload.Enabled)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/mock/config/"):
		id := strings.TrimPrefix(r.URL.Path, "/api/mock/config/")
		err := appInstance.RemoveMockConfig(id)
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
		return
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/mock/configs/") && strings.HasSuffix(r.URL.Path, "/list"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/mock/configs/"), "/list")
		data, err := appInstance.LoadMockConfigs(id)
		writeJSON(w, data, err)
		return

	default:
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
	}
}

func decodeJSON(r *http.Request, target interface{}) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	if len(body) == 0 {
		return nil
	}
	return json.Unmarshal(body, target)
}

func writeJSON(w http.ResponseWriter, data interface{}, err error) {
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(data)
}

func errInvalidMode(mode string) error {
	return fmt.Errorf("unsupported import mode: %s", mode)
}
