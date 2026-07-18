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
	"gopost/app/pkg/storage"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

// version is set at build time via -ldflags "-X main.version=..."
var version = "dev"

func main() {
	// Get app data directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		slog.Error("cannot determine home directory", "error", err)
		os.Exit(1)
	}
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

	// Run migration from legacy JSON blobs to per-file GitStore
	migrated, err := storage.MigrateFromLegacy(appDataDir)
	if err != nil {
		slog.Warn("migration warning", "error", err)
	}
	if migrated {
		slog.Info("data migrated to Git-friendly format")
		slog.Info("old files backed up as .legacy.bak")
	}

	// Initialize storage
	store, err := storage.NewGitStore(appDataDir)
	if err != nil {
		slog.Error("failed to initialize storage", "error", err)
		os.Exit(1)
	}

	// Create app
	appInstance := app.NewApp(store)

	distFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		slog.Error("failed to embed frontend assets", "error", err)
		os.Exit(1)
	}

	staticHandler := http.FileServer(http.FS(distFS))
	apiMux := newAPIRouter(appInstance)
	assetHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			apiMux.ServeHTTP(w, r)
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

	// Bridge mock server activity into Wails events so the frontend can
	// subscribe instead of polling (see MockServerContext).
	appInstance.SetMockEventCallback(func(kind string, data any) {
		wailsApp.Event.Emit("mock:"+kind, data)
	})

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

// newAPIRouter builds an http.ServeMux with all API routes registered.
func newAPIRouter(appInstance *app.App) http.Handler {
	mux := http.NewServeMux()

	// h wraps a handler to set the Content-Type header on every API response.
	h := func(fn func(http.ResponseWriter, *http.Request)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			fn(w, r)
		}
	}

	// ── Collections ──────────────────────────────────────────────

	mux.HandleFunc("GET /api/collections", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetCollections()
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/collections", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Name string `json:"name"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.CreateCollection(payload.Name)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("DELETE /api/collections/{id}", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.DeleteCollection(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("PUT /api/collections/{id}", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Name string `json:"name"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.UpdateCollection(r.PathValue("id"), payload.Name)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("GET /api/collections/{id}/requests", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetRequestsForCollection(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/collections/{id}/requests", h(func(w http.ResponseWriter, r *http.Request) {
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
		val, err := appInstance.CreateRequest(app.CreateRequestParams{
			CollectionID: r.PathValue("id"),
			Name:         payload.Name,
			Method:       payload.Method,
			URL:          payload.URL,
			Headers:      payload.Headers,
			Body:         payload.Body,
			Description:  payload.Description,
		})
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/collections/{id}/import-http", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Content string `json:"content"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.ImportHTTPContent(payload.Content, r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("GET /api/collections/{id}/export-http", h(func(w http.ResponseWriter, r *http.Request) {
		data, err := appInstance.ExportCollectionAsHTTPContent(r.PathValue("id"))
		writeJSON(w, map[string]string{"content": data}, err)
	}))

	mux.HandleFunc("POST /api/collections/{id}/export-http-file", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.ExportCollectionAsHTTPFile(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/collections/{id}/run", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			StopOnFail bool `json:"stopOnFail"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.RunCollection(r.PathValue("id"), payload.StopOnFail)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/collections/{id}/reveal", h(func(w http.ResponseWriter, r *http.Request) {
		err := appInstance.RevealInFinder(r.PathValue("id"))
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
	}))

	// ── Requests ─────────────────────────────────────────────────

	// Search must be registered before {id} so exact literal takes priority.
	mux.HandleFunc("GET /api/requests/search", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.SearchRequests(r.URL.Query().Get("q"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("GET /api/requests/{id}", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetRequest(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	// Sub-routes with path suffix must come before the generic PUT {id}.
	mux.HandleFunc("PUT /api/requests/{id}/move", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			CollectionID string `json:"collection_id"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.MoveRequest(r.PathValue("id"), payload.CollectionID)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("PUT /api/requests/{id}/graphql", h(func(w http.ResponseWriter, r *http.Request) {
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
		val, err := appInstance.SetRequestGraphQL(r.PathValue("id"), payload.Query, payload.Variables, payload.OperationName, payload.SchemaURL)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("PUT /api/requests/{id}", h(func(w http.ResponseWriter, r *http.Request) {
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
		val, err := appInstance.UpdateRequest(r.PathValue("id"), app.UpdateRequestParams{
			Name:        payload.Name,
			Method:      payload.Method,
			URL:         payload.URL,
			Headers:     payload.Headers,
			Body:        payload.Body,
			Description: payload.Description,
		})
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("DELETE /api/requests/{id}", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.DeleteRequest(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/requests/{id}/execute", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			EnvVars map[string]string `json:"envVars"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.ExecuteRequest(r.PathValue("id"), app.ExecuteRequestParams{EnvVars: payload.EnvVars})
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/requests/execute-raw", h(func(w http.ResponseWriter, r *http.Request) {
		var payload app.ExecuteRawParams
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.ExecuteRequestRaw(payload)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/requests/execute-graphql-raw", h(func(w http.ResponseWriter, r *http.Request) {
		var payload app.ExecuteRawParams
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.ExecuteGraphQLRequestRaw(payload)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/requests/{id}/auth", h(func(w http.ResponseWriter, r *http.Request) {
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
		val, err := appInstance.SetRequestAuth(r.PathValue("id"), app.SetRequestAuthParams{
			AuthType:    payload.AuthType,
			Token:       payload.Token,
			Username:    payload.Username,
			Password:    payload.Password,
			APIKey:      payload.APIKey,
			APIKeyValue: payload.APIKeyValue,
			APIKeyIn:    payload.APIKeyIn,
		})
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/requests/{id}/duplicate", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.DuplicateRequest(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/requests/{id}/execute-graphql", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.ExecuteGraphQLRequest(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	// ── Environments ─────────────────────────────────────────────

	mux.HandleFunc("GET /api/environments", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetEnvironments()
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/environments", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Name      string         `json:"name"`
			Variables map[string]any `json:"variables"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.CreateEnvironment(payload.Name, payload.Variables)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("DELETE /api/environments/{id}", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.DeleteEnvironment(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("PUT /api/environments/{id}", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Name      string         `json:"name"`
			Variables map[string]any `json:"variables"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.UpdateEnvironment(r.PathValue("id"), payload.Name, payload.Variables)
		writeJSON(w, val, err)
	}))

	// ── History ──────────────────────────────────────────────────

	mux.HandleFunc("GET /api/history", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetHistory()
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/history/{id}/replay", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.ReplayHistoryEntry(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	// ── User Config ──────────────────────────────────────────────

	mux.HandleFunc("GET /api/user-config", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetUserConfig()
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("PUT /api/user-config", h(func(w http.ResponseWriter, r *http.Request) {
		var cfg models.UserConfig
		if err := decodeJSON(r, &cfg); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.SaveUserConfig(&cfg)
		writeJSON(w, val, err)
	}))

	// ── Runs ─────────────────────────────────────────────────────

	mux.HandleFunc("GET /api/runs/{id}", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetRunHistory(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	// ── Export / Import ──────────────────────────────────────────

	mux.HandleFunc("GET /api/export-content", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.ExportSnapshot()
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/import-content", h(func(w http.ResponseWriter, r *http.Request) {
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
			err := appInstance.ImportSnapshot(payload.Data)
			writeJSON(w, map[string]bool{"ok": err == nil}, err)
		case "merge":
			err := appInstance.MergeSnapshot(payload.Data)
			writeJSON(w, map[string]bool{"ok": err == nil}, err)
		case "preview":
			writeJSON(w, map[string]any{
				"ok":           true,
				"collections":  len(payload.Data.Collections),
				"requests":     len(payload.Data.Requests),
				"environments": len(payload.Data.Environments),
				"history":      len(payload.Data.History),
			}, nil)
		default:
			writeJSON(w, nil, fmt.Errorf("unsupported import mode: %s", payload.Mode))
		}
	}))

	// ── Misc ─────────────────────────────────────────────────────

	mux.HandleFunc("GET /api/storage-info", h(func(w http.ResponseWriter, r *http.Request) {
		val := appInstance.GetStorageInfo()
		writeJSON(w, val, nil)
	}))

	mux.HandleFunc("GET /api/term-port", h(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]int{"port": appInstance.GetTerminalPort()}, nil)
	}))

	// ── GraphQL Introspection ────────────────────────────────────

	mux.HandleFunc("POST /api/graphql/introspect", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			URL string `json:"url"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.IntrospectGraphQLSchema(payload.URL)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("GET /api/graphql/schema", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetCachedGraphQLSchema(r.URL.Query().Get("url"))
		writeJSON(w, val, err)
	}))

	// ── Git ──────────────────────────────────────────────────────

	mux.HandleFunc("POST /api/git/{id}/init", h(func(w http.ResponseWriter, r *http.Request) {
		err := appInstance.GitInit(r.PathValue("id"))
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
	}))

	mux.HandleFunc("GET /api/git/{id}/status", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GitStatus(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/git/{id}/commit", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Message string `json:"message"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		err := appInstance.GitCommit(r.PathValue("id"), payload.Message)
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
	}))

	mux.HandleFunc("GET /api/git/{id}/log", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GitLog(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	// ── WebSocket ────────────────────────────────────────────────

	mux.HandleFunc("POST /api/ws/connect", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			RequestID string            `json:"requestId"`
			URL       string            `json:"url"`
			Headers   map[string]string `json:"headers"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.ConnectWebSocket(payload.RequestID, payload.URL, payload.Headers)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/ws/disconnect", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			ConnID string `json:"connId"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		err := appInstance.DisconnectWebSocket(payload.ConnID)
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
	}))

	mux.HandleFunc("POST /api/ws/send", h(func(w http.ResponseWriter, r *http.Request) {
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
	}))

	mux.HandleFunc("GET /api/ws/messages", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetWebSocketMessages(r.URL.Query().Get("connId"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("GET /api/ws/messages/all", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetAllWebSocketMessages(r.URL.Query().Get("connId"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("GET /api/ws/status", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetWebSocketStatus(r.URL.Query().Get("connId"))
		writeJSON(w, val, err)
	}))

	// ── SSE ──────────────────────────────────────────────────────

	mux.HandleFunc("POST /api/sse/connect", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			RequestID string            `json:"requestId"`
			URL       string            `json:"url"`
			Headers   map[string]string `json:"headers"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.ConnectSSE(payload.RequestID, payload.URL, payload.Headers)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/sse/disconnect", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			ConnID string `json:"connId"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		err := appInstance.DisconnectSSE(payload.ConnID)
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
	}))

	mux.HandleFunc("GET /api/sse/events", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetSSEEvents(r.URL.Query().Get("connId"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("GET /api/sse/events/all", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetAllSSEEvents(r.URL.Query().Get("connId"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("GET /api/sse/status", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetSSEStatus(r.URL.Query().Get("connId"))
		writeJSON(w, val, err)
	}))

	// ── Scripts ──────────────────────────────────────────────────

	mux.HandleFunc("GET /api/scripts/{id}/get", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.GetRequestScripts(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("PUT /api/scripts/{id}/set", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			PreRequestScript string `json:"preRequestScript"`
			TestScript       string `json:"testScript"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.SetRequestScripts(r.PathValue("id"), payload.PreRequestScript, payload.TestScript)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/scripts/{id}/pre-request", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Script string `json:"script"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.RunPreRequestScript(r.PathValue("id"), payload.Script)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/scripts/{id}/test", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Script   string         `json:"script"`
			Response map[string]any `json:"response"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val := appInstance.RunTestScript(r.PathValue("id"), payload.Script, payload.Response)
		writeJSON(w, val, nil)
	}))

	// ── Mock Server ──────────────────────────────────────────────

	mux.HandleFunc("POST /api/mock/start", h(func(w http.ResponseWriter, r *http.Request) {
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
	}))

	mux.HandleFunc("POST /api/mock/stop", h(func(w http.ResponseWriter, r *http.Request) {
		err := appInstance.StopMockServer()
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
	}))

	mux.HandleFunc("GET /api/mock/status", h(func(w http.ResponseWriter, r *http.Request) {
		val := appInstance.GetMockStatus()
		writeJSON(w, val, nil)
	}))

	mux.HandleFunc("GET /api/mock/log", h(func(w http.ResponseWriter, r *http.Request) {
		val := appInstance.GetMockLog()
		writeJSON(w, val, nil)
	}))

	mux.HandleFunc("DELETE /api/mock/log", h(func(w http.ResponseWriter, r *http.Request) {
		appInstance.ClearMockLog()
		writeJSON(w, map[string]bool{"ok": true}, nil)
	}))

	mux.HandleFunc("POST /api/mock/config/{id}/set", h(func(w http.ResponseWriter, r *http.Request) {
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
		val, err := appInstance.SetMockConfig(r.PathValue("id"), payload.StatusCode, payload.Headers, payload.Body, payload.LatencyMs, payload.Enabled)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("DELETE /api/mock/config/{id}", h(func(w http.ResponseWriter, r *http.Request) {
		err := appInstance.RemoveMockConfig(r.PathValue("id"))
		writeJSON(w, map[string]bool{"ok": err == nil}, err)
	}))

	mux.HandleFunc("GET /api/mock/configs/{id}/list", h(func(w http.ResponseWriter, r *http.Request) {
		val, err := appInstance.LoadMockConfigs(r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	// -- Catch-all: unmatched /api/ routes/a
	// -- Postman Import --
	mux.HandleFunc("POST /api/collections/{id}/import-postman", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Content string `json:"content"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.ImportPostmanCollection(payload.Content, r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("POST /api/environments/import-postman", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Content string `json:"content"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.ImportPostmanEnvironment(payload.Content)
		writeJSON(w, val, err)
	}))

	// -- OpenAPI/Swagger Import --
	mux.HandleFunc("POST /api/collections/{id}/import-openapi", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Content string `json:"content"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.ImportOpenAPISpec(payload.Content, r.PathValue("id"))
		writeJSON(w, val, err)
	}))

	// -- Code Generation --
	mux.HandleFunc("POST /api/requests/{id}/generate-code", h(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Language string `json:"language"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		val, err := appInstance.GenerateCode(r.PathValue("id"), payload.Language)
		writeJSON(w, val, err)
	}))

	mux.HandleFunc("GET /api/code-languages", h(func(w http.ResponseWriter, r *http.Request) {
		val := appInstance.GetCodeLanguages()
		writeJSON(w, val, nil)
	}))

	// -- Catch-all --
	// ── Catch-all: unmatched /api/ routes ────────────────────────

	mux.HandleFunc("/api/", h(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
	}))

	return mux
}

func decodeJSON(r *http.Request, target any) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	if len(body) == 0 {
		return nil
	}
	return json.Unmarshal(body, target)
}

func writeJSON(w http.ResponseWriter, data any, err error) {
	if err != nil {
		code := http.StatusBadRequest
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			code = http.StatusNotFound
		}
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(data)
}
