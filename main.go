package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
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

func main() {
	// Get app data directory
	homeDir, _ := os.UserHomeDir()
	appDataDir := filepath.Join(homeDir, ".gopost")
	os.MkdirAll(appDataDir, 0755)

	// Create app
	appInstance := app.NewApp(appDataDir)

	distFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		panic(err)
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

	// Create the app window
	wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "GoPost",
		Width:  1400,
		Height: 900,
		URL:    "/",
	}).Show()

	err = wailsApp.Run()
	if err != nil {
		panic(err)
	}
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
		data, err := appInstance.ExecuteRequest(id)
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
	case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/requests/") && strings.HasSuffix(r.URL.Path, "/move"):
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/requests/"), "/move")
		var payload struct {
			CollectionID string `json:"collectionId"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		data, err := appInstance.MoveRequest(id, payload.CollectionID)
		writeJSON(w, data, err)
		return
	case r.Method == http.MethodGet && r.URL.Path == "/api/requests/search":
		data, err := appInstance.SearchRequests(r.URL.Query().Get("q"))
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
	case r.Method == http.MethodPost && r.URL.Path == "/api/export":
		var payload struct {
			Path string `json:"path"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		writeJSON(w, map[string]bool{"ok": true}, appInstance.ExportData(payload.Path))
		return
	case r.Method == http.MethodPost && r.URL.Path == "/api/import":
		var payload struct {
			Path string `json:"path"`
		}
		if err := decodeJSON(r, &payload); err != nil {
			writeJSON(w, nil, err)
			return
		}
		writeJSON(w, map[string]bool{"ok": true}, appInstance.ImportData(payload.Path))
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
