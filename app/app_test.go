package app

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gopost/app/pkg/models"
	"gopost/app/pkg/storage"
)

// newTestApp creates an App backed by a temporary directory.
// No Wails context is needed for most business-logic methods.
func newTestApp(t *testing.T) *App {
	t.Helper()
	store, _ := storage.NewGitStore(t.TempDir())
	return NewApp(store)
}

// ==================== Collections ====================

func TestApp_CreateCollection(t *testing.T) {
	a := newTestApp(t)
	col, err := a.CreateCollection("My API")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if col.Name != "My API" {
		t.Errorf("Name: want 'My API', got %q", col.Name)
	}
	if col.ID == "" {
		t.Error("ID should be assigned")
	}
	if col.CreatedAt.IsZero() {
		t.Error("CreatedAt should be set")
	}
}

func TestApp_GetCollections_Empty(t *testing.T) {
	a := newTestApp(t)
	cols, err := a.GetCollections()
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(cols) != 0 {
		t.Errorf("want 0, got %d", len(cols))
	}
}

func TestApp_UpdateCollection(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("Old Name")
	updated, err := a.UpdateCollection(col.ID, "New Name")
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "New Name" {
		t.Errorf("want 'New Name', got %q", updated.Name)
	}
	if !updated.UpdatedAt.After(col.CreatedAt) && !updated.UpdatedAt.Equal(col.CreatedAt) {
		t.Error("UpdatedAt should be >= CreatedAt after update")
	}
}

func TestApp_UpdateCollection_NotFound(t *testing.T) {
	a := newTestApp(t)
	_, err := a.UpdateCollection("nonexistent", "Name")
	if err == nil {
		t.Error("expected error for nonexistent collection")
	}
}

func TestApp_DeleteCollection_CleansHistory(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("ToDelete")

	a.git.SaveHistoryEntry(&models.HistoryEntry{
		ID: "h1", CollectionID: col.ID, RequestID: "r1",
		Method: "GET", URL: "https://example.com", CreatedAt: time.Now(),
	})
	a.git.SaveHistoryEntry(&models.HistoryEntry{
		ID: "h2", CollectionID: "other-col", RequestID: "r2",
		Method: "GET", URL: "https://other.com", CreatedAt: time.Now(),
	})

	result, err := a.DeleteCollection(col.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !result["ok"] {
		t.Error("delete should return ok=true")
	}

	history, _ := a.git.GetHistory()
	for _, h := range history {
		if h.CollectionID == col.ID {
			t.Errorf("history entry for deleted collection should be removed: %v", h)
		}
	}
}

// ==================== Requests ====================

func TestApp_CreateRequest(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")

	req, err := a.CreateRequest(CreateRequestParams{
		CollectionID: col.ID,
		Name:         "Get Users",
		Method:       "GET",
		URL:          "https://example.com/users",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if req.Name != "Get Users" {
		t.Errorf("Name: want 'Get Users', got %q", req.Name)
	}
	if req.ID == "" {
		t.Error("ID should be assigned")
	}
	if req.Headers == nil {
		t.Error("Headers should be initialized (not nil)")
	}
	if req.Auth.Type != "none" {
		t.Errorf("default Auth.Type should be 'none', got %q", req.Auth.Type)
	}
}

func TestApp_UpdateRequest(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	req, _ := a.CreateRequest(CreateRequestParams{
		CollectionID: col.ID,
		Name:         "Old",
		Method:       "GET",
		URL:          "https://old.com",
	})

	updated, err := a.UpdateRequest(req.ID, UpdateRequestParams{
		Name:        "New",
		Method:      "POST",
		URL:         "https://new.com",
		Headers:     map[string]string{"X-Custom": "val"},
		Body:        `{"key":"value"}`,
		Description: "new desc",
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "New" {
		t.Errorf("Name: want 'New', got %q", updated.Name)
	}
	if updated.Method != "POST" {
		t.Errorf("Method: want 'POST', got %q", updated.Method)
	}
	if updated.URL != "https://new.com" {
		t.Errorf("URL mismatch")
	}
	if updated.Headers["X-Custom"] != "val" {
		t.Errorf("header mismatch")
	}
}

func TestApp_DeleteRequest(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	req, _ := a.CreateRequest(CreateRequestParams{
		CollectionID: col.ID,
		Name:         "ToDelete",
		Method:       "GET",
		URL:          "https://example.com",
	})

	result, err := a.DeleteRequest(req.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !result["ok"] {
		t.Error("delete should return ok=true")
	}

	reqs, _ := a.GetRequestsForCollection(col.ID)
	if len(reqs) != 0 {
		t.Errorf("want 0 requests after delete, got %d", len(reqs))
	}
}

func TestApp_DuplicateRequest(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	req, _ := a.CreateRequest(CreateRequestParams{
		CollectionID: col.ID,
		Name:         "Original",
		Method:       "GET",
		URL:          "https://example.com",
	})

	dup, err := a.DuplicateRequest(req.ID)
	if err != nil {
		t.Fatalf("duplicate: %v", err)
	}
	if dup.ID == req.ID {
		t.Error("duplicate should have new ID")
	}
	if dup.Name != "Original Copy" {
		t.Errorf("duplicate name: want 'Original Copy', got %q", dup.Name)
	}

	reqs, _ := a.GetRequestsForCollection(col.ID)
	if len(reqs) != 2 {
		t.Errorf("want 2 requests after duplicate, got %d", len(reqs))
	}
}

func TestApp_MoveRequest(t *testing.T) {
	a := newTestApp(t)
	src, _ := a.CreateCollection("Source")
	dst, _ := a.CreateCollection("Destination")
	req, _ := a.CreateRequest(CreateRequestParams{
		CollectionID: src.ID,
		Name:         "Movable",
		Method:       "GET",
		URL:          "https://example.com",
	})

	moved, err := a.MoveRequest(req.ID, dst.ID)
	if err != nil {
		t.Fatalf("move: %v", err)
	}
	if moved.CollectionID != dst.ID {
		t.Errorf("CollectionID: want %q, got %q", dst.ID, moved.CollectionID)
	}

	srcReqs, _ := a.GetRequestsForCollection(src.ID)
	if len(srcReqs) != 0 {
		t.Errorf("source should be empty after move, got %d", len(srcReqs))
	}
	dstReqs, _ := a.GetRequestsForCollection(dst.ID)
	if len(dstReqs) != 1 {
		t.Errorf("destination should have 1 request, got %d", len(dstReqs))
	}
}

func TestApp_SearchRequests_EmptyQueryReturnsAll(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "Alpha", Method: "GET", URL: "https://alpha.com"})
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "Beta", Method: "POST", URL: "https://beta.com"})

	results, err := a.SearchRequests("")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) != 2 {
		t.Errorf("empty query should return all 2 requests, got %d", len(results))
	}
}

func TestApp_SearchRequests_FilterByName(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "Get Users", Method: "GET", URL: "https://example.com/users"})
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "Create Post", Method: "POST", URL: "https://example.com/posts"})

	results, _ := a.SearchRequests("user")
	if len(results) != 1 || results[0].Name != "Get Users" {
		t.Errorf("filter by name: want [Get Users], got %v", results)
	}
}

func TestApp_SearchRequests_FilterByURL(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "Users", Method: "GET", URL: "https://api.example.com/users"})
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "Posts", Method: "GET", URL: "https://api.example.com/posts"})

	results, _ := a.SearchRequests("posts")
	if len(results) != 1 || results[0].Name != "Posts" {
		t.Errorf("filter by URL: %v", results)
	}
}

func TestApp_SearchRequests_CaseInsensitive(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "GetUser", Method: "GET", URL: "https://example.com"})

	results, _ := a.SearchRequests("GETUSER")
	if len(results) != 1 {
		t.Errorf("case-insensitive search failed, got %d results", len(results))
	}
}

func TestApp_SetRequestAuth_Bearer(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	req, _ := a.CreateRequest(CreateRequestParams{
		CollectionID: col.ID,
		Name:         "Secure",
		Method:       "GET",
		URL:          "https://example.com",
	})

	updated, err := a.SetRequestAuth(req.ID, SetRequestAuthParams{
		AuthType: "bearer",
		Token:    "mytoken",
	})
	if err != nil {
		t.Fatalf("set auth: %v", err)
	}
	if updated.Auth.Type != "bearer" {
		t.Errorf("Auth.Type: want 'bearer', got %q", updated.Auth.Type)
	}
	if updated.Auth.Token != "mytoken" {
		t.Errorf("Auth.Token: want 'mytoken', got %q", updated.Auth.Token)
	}
}

// ==================== Environments ====================

func TestApp_CreateEnvironment(t *testing.T) {
	a := newTestApp(t)
	env, err := a.CreateEnvironment("Production", map[string]interface{}{"base_url": "https://api.example.com"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if env.Name != "Production" {
		t.Errorf("Name: want 'Production', got %q", env.Name)
	}
	if env.Variables["base_url"] != "https://api.example.com" {
		t.Errorf("variable mismatch")
	}
}

func TestApp_UpdateEnvironment(t *testing.T) {
	a := newTestApp(t)
	env, _ := a.CreateEnvironment("Staging", map[string]interface{}{"url": "https://staging.example.com"})

	updated, err := a.UpdateEnvironment(env.ID, "Updated", map[string]interface{}{"url": "https://new.example.com", "token": "abc"})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Name != "Updated" {
		t.Errorf("Name: want 'Updated', got %q", updated.Name)
	}
	if updated.Variables["token"] != "abc" {
		t.Errorf("new variable not set: %v", updated.Variables)
	}
}

func TestApp_DeleteEnvironment(t *testing.T) {
	a := newTestApp(t)
	env, _ := a.CreateEnvironment("ToDelete", map[string]interface{}{})
	result, err := a.DeleteEnvironment(env.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	if !result["ok"] {
		t.Error("delete should return ok=true")
	}

	envs, _ := a.GetEnvironments()
	if len(envs) != 0 {
		t.Errorf("want 0 environments after delete, got %d", len(envs))
	}
}

// ==================== HTTP Import / Export ====================

func TestApp_ImportExportHTTPContent_Roundtrip(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("TestCollection")
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "Get Root", Method: "GET", URL: "https://example.com/", Headers: map[string]string{"Accept": "application/json"}})
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "Create Item", Method: "POST", URL: "https://example.com/items",
		Headers: map[string]string{"Content-Type": "application/json"}, Body: `{"name":"test"}`})

	// Export
	content, err := a.ExportCollectionAsHTTPContent(col.ID)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if content == "" {
		t.Fatal("exported content should not be empty")
	}

	// Import into new collection
	col2, _ := a.CreateCollection("Imported")
	imported, err := a.ImportHTTPContent(content, col2.ID)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(imported) != 2 {
		t.Errorf("want 2 imported requests, got %d", len(imported))
	}
}

// ==================== Snapshot Export / Import ====================

func TestApp_ExportImportSnapshot_Roundtrip(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("SnapAPI")
	a.CreateRequest(CreateRequestParams{CollectionID: col.ID, Name: "SnapRequest", Method: "GET", URL: "https://snap.example.com"})
	a.CreateEnvironment("SnapEnv", map[string]interface{}{"k": "v"})

	snapshot, err := a.ExportSnapshot()
	if err != nil {
		t.Fatalf("export snapshot: %v", err)
	}
	if len(snapshot.Collections) != 1 {
		t.Errorf("snapshot collections: want 1, got %d", len(snapshot.Collections))
	}

	// Import into fresh app
	a2 := newTestApp(t)
	if err := a2.ImportSnapshot(*snapshot); err != nil {
		t.Fatalf("import snapshot: %v", err)
	}

	cols, _ := a2.GetCollections()
	if len(cols) != 1 || cols[0].Name != "SnapAPI" {
		t.Errorf("imported collections: %v", cols)
	}
}

// ==================== UserConfig ====================

func TestApp_GetUserConfig_Defaults(t *testing.T) {
	a := newTestApp(t)
	cfg, err := a.GetUserConfig()
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if cfg.ThemeID == "" {
		t.Error("default ThemeID should not be empty")
	}
}

func TestApp_SaveAndGetUserConfig(t *testing.T) {
	a := newTestApp(t)
	cfg, _ := a.GetUserConfig()
	cfg.ThemeID = "one-dark-pro"
	result, err := a.SaveUserConfig(cfg)
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if result.ThemeID != "one-dark-pro" {
		t.Errorf("saved theme: want 'one-dark-pro', got %q", result.ThemeID)
	}

	loaded, _ := a.GetUserConfig()
	if loaded.ThemeID != "one-dark-pro" {
		t.Errorf("loaded theme: want 'one-dark-pro', got %q", loaded.ThemeID)
	}
}

// ==================== Execute / Scripts / Mock / Import ====================

func TestApp_ExecuteRequestRaw(t *testing.T) {
	a := newTestApp(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(srv.Close)

	result, err := a.ExecuteRequestRaw(ExecuteRawParams{
		Method: "GET",
		URL:    srv.URL + "/ping",
		Name:   "ping",
	})
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	status, _ := result["status"].(int)
	if status != 200 && result["status"] != float64(200) && result["code"] != 200 && result["code"] != float64(200) {
		// status may be int or present under code depending on path
		if result["body"] == nil {
			t.Fatalf("unexpected result: %#v", result)
		}
	}
	body, _ := result["body"].(string)
	if body != `{"ok":true}` {
		t.Errorf("body: want ok json, got %q", body)
	}
}

func TestApp_ExecuteRequestRaw_RequiresURL(t *testing.T) {
	a := newTestApp(t)
	_, err := a.ExecuteRequestRaw(ExecuteRawParams{})
	if err == nil {
		t.Fatal("expected error for empty URL")
	}
}

func TestApp_SetAndGetRequestScripts(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("Scripts")
	req, err := a.CreateRequest(CreateRequestParams{
		CollectionID: col.ID,
		Name:         "R",
		Method:       "GET",
		URL:          "https://example.com",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	updated, err := a.SetRequestScripts(req.ID, `request.headers["X"]="1"`, `assert.status(expected=200)`)
	if err != nil {
		t.Fatalf("set scripts: %v", err)
	}
	if updated.PreRequestScript == "" || updated.TestScript == "" {
		t.Fatal("scripts should be persisted on request")
	}

	got, err := a.GetRequestScripts(req.ID)
	if err != nil {
		t.Fatalf("get scripts: %v", err)
	}
	if got["pre_request_script"] == "" || got["test_script"] == "" {
		t.Errorf("got scripts: %#v", got)
	}
}

func TestApp_RunPreRequestAndTestScript(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("S")
	req, _ := a.CreateRequest(CreateRequestParams{
		CollectionID: col.ID,
		Name:         "R",
		Method:       "GET",
		URL:          "https://example.com",
		Headers:      map[string]string{},
	})

	modified, err := a.RunPreRequestScript(req.ID, `request.headers["X-Test"] = "yes"`)
	if err != nil {
		t.Fatalf("pre: %v", err)
	}
	if modified.Headers["X-Test"] != "yes" {
		t.Errorf("header not set: %#v", modified.Headers)
	}

	result := a.RunTestScript(req.ID, `assert.status(expected=200)`, map[string]interface{}{
		"status":  200,
		"code":    200,
		"body":    "ok",
		"time":    int64(1),
		"headers": map[string]string{},
	})
	if !result.Passed {
		t.Fatalf("test script failed: %s", result.Error)
	}
}

func TestApp_MockServerLifecycle(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("M")
	req, _ := a.CreateRequest(CreateRequestParams{
		CollectionID: col.ID,
		Name:         "ping",
		Method:       "GET",
		URL:          "http://localhost/ping",
	})

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	if err := a.StartMockServer(port); err != nil {
		t.Fatalf("start: %v", err)
	}
	t.Cleanup(func() { _ = a.StopMockServer() })

	mc, err := a.SetMockConfig(req.ID, 201, map[string]string{"X": "1"}, `{"m":true}`, 0, true)
	if err != nil {
		t.Fatalf("set mock: %v", err)
	}
	if mc.StatusCode != 201 {
		t.Errorf("status: %d", mc.StatusCode)
	}

	configs, err := a.LoadMockConfigs(col.ID)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(configs) != 1 {
		t.Fatalf("want 1 mock config, got %d", len(configs))
	}

	status := a.GetMockStatus()
	if status == nil || !status.Running {
		t.Fatal("mock server should be running")
	}

	a.ClearMockLog()
	if len(a.GetMockLog()) != 0 {
		t.Error("log should be empty after clear")
	}

	if err := a.RemoveMockConfig(req.ID); err != nil {
		t.Fatalf("remove: %v", err)
	}
}

func TestApp_ImportPostmanAndOpenAPI(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("Import")

	postman := `{
	  "info": {"name": "P", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
	  "item": [{"name": "Get", "request": {"method": "GET", "url": {"raw": "https://example.com/a", "host": ["example","com"], "path": ["a"]}}}]
	}`
	res, err := a.ImportPostmanCollection(postman, col.ID)
	if err != nil {
		t.Fatalf("postman: %v", err)
	}
	if len(res) == 0 {
		t.Fatalf("empty postman import result: %#v", res)
	}

	openapi := `{
	  "openapi": "3.0.0",
	  "info": {"title": "T", "version": "1.0"},
	  "paths": {"/pets": {"get": {"summary": "List", "responses": {"200": {"description": "ok"}}}}}
	}`
	ores, err := a.ImportOpenAPISpec(openapi, col.ID)
	if err != nil {
		t.Fatalf("openapi: %v", err)
	}
	if len(ores) == 0 {
		t.Fatal("empty openapi import result")
	}
}

func TestApp_GenerateCode(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("Code")
	req, _ := a.CreateRequest(CreateRequestParams{
		CollectionID: col.ID,
		Name:         "R",
		Method:       "GET",
		URL:          "https://example.com",
	})
	langs := a.GetCodeLanguages()
	if len(langs) == 0 {
		t.Fatal("expected languages")
	}
	code, err := a.GenerateCode(req.ID, "curl")
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if code["code"] == nil && code["language"] == nil {
		if len(code) == 0 {
			t.Fatalf("empty codegen: %#v", code)
		}
	}
}

func TestApp_GitInitAndStatus(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("Git")
	if err := a.GitInit(col.ID); err != nil {
		t.Fatalf("init: %v", err)
	}
	st, err := a.GitStatus(col.ID)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if !st.IsRepo {
		t.Error("expected repo after init")
	}
}

func TestApp_GetStorageInfo(t *testing.T) {
	a := newTestApp(t)
	info := a.GetStorageInfo()
	if info["base_dir"] == "" {
		t.Errorf("base_dir missing: %#v", info)
	}
}

func TestApp_SetWorkspaceDir(t *testing.T) {
	a := newTestApp(t)
	ws := t.TempDir()
	t.Setenv("HOME", t.TempDir())
	info, err := a.SetWorkspaceDir(ws)
	if err != nil {
		t.Fatal(err)
	}
	if info["base_dir"] == "" {
		t.Fatal("missing base_dir")
	}
	col, err := a.CreateCollection("Demo")
	if err != nil {
		t.Fatal(err)
	}
	if col.ID != "Demo" {
		t.Fatalf("expected slug id Demo, got %q", col.ID)
	}
	cmd := a.BuildCICommand(col.ID, "ci")
	if cmd == "" || !strings.Contains(cmd, "--data-dir") || !strings.Contains(cmd, "Demo") || !strings.Contains(cmd, "--env") {
		t.Fatalf("bad ci command: %s", cmd)
	}
}

func TestApp_ServiceStartup(t *testing.T) {
	a := newTestApp(t)
	if err := a.ServiceStartup(context.Background(), nil); err != nil {
		t.Fatal(err)
	}
}
