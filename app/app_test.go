//go:build integration

package app

import (
	"testing"
	"time"

	"gopost/app/pkg/models"
)

// newTestApp creates an App backed by a temporary directory.
// No Wails context is needed for most business-logic methods.
func newTestApp(t *testing.T) *App {
	t.Helper()
	return NewApp(t.TempDir())
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

	req, err := a.CreateRequest(col.ID, "Get Users", "GET", "https://example.com/users", nil, "", "")
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
	req, _ := a.CreateRequest(col.ID, "Old", "GET", "https://old.com", nil, "", "")

	updated, err := a.UpdateRequest(req.ID, "New", "POST", "https://new.com",
		map[string]string{"X-Custom": "val"}, `{"key":"value"}`, "new desc")
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
	req, _ := a.CreateRequest(col.ID, "ToDelete", "GET", "https://example.com", nil, "", "")

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
	req, _ := a.CreateRequest(col.ID, "Original", "GET", "https://example.com", nil, "", "")

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
	req, _ := a.CreateRequest(src.ID, "Movable", "GET", "https://example.com", nil, "", "")

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
	a.CreateRequest(col.ID, "Alpha", "GET", "https://alpha.com", nil, "", "")
	a.CreateRequest(col.ID, "Beta", "POST", "https://beta.com", nil, "", "")

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
	a.CreateRequest(col.ID, "Get Users", "GET", "https://example.com/users", nil, "", "")
	a.CreateRequest(col.ID, "Create Post", "POST", "https://example.com/posts", nil, "", "")

	results, _ := a.SearchRequests("user")
	if len(results) != 1 || results[0].Name != "Get Users" {
		t.Errorf("filter by name: want [Get Users], got %v", results)
	}
}

func TestApp_SearchRequests_FilterByURL(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	a.CreateRequest(col.ID, "Users", "GET", "https://api.example.com/users", nil, "", "")
	a.CreateRequest(col.ID, "Posts", "GET", "https://api.example.com/posts", nil, "", "")

	results, _ := a.SearchRequests("posts")
	if len(results) != 1 || results[0].Name != "Posts" {
		t.Errorf("filter by URL: %v", results)
	}
}

func TestApp_SearchRequests_CaseInsensitive(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	a.CreateRequest(col.ID, "GetUser", "GET", "https://example.com", nil, "", "")

	results, _ := a.SearchRequests("GETUSER")
	if len(results) != 1 {
		t.Errorf("case-insensitive search failed, got %d results", len(results))
	}
}

func TestApp_SetRequestAuth_Bearer(t *testing.T) {
	a := newTestApp(t)
	col, _ := a.CreateCollection("API")
	req, _ := a.CreateRequest(col.ID, "Secure", "GET", "https://example.com", nil, "", "")

	updated, err := a.SetRequestAuth(req.ID, "bearer", "mytoken", "", "", "", "", "")
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
	a.CreateRequest(col.ID, "Get Root", "GET", "https://example.com/", map[string]string{"Accept": "application/json"}, "", "")
	a.CreateRequest(col.ID, "Create Item", "POST", "https://example.com/items",
		map[string]string{"Content-Type": "application/json"}, `{"name":"test"}`, "")

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
	a.CreateRequest(col.ID, "SnapRequest", "GET", "https://snap.example.com", nil, "", "")
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
	if !result["ok"] {
		t.Error("save should return ok=true")
	}

	loaded, _ := a.GetUserConfig()
	if loaded.ThemeID != "one-dark-pro" {
		t.Errorf("loaded theme: want 'one-dark-pro', got %q", loaded.ThemeID)
	}
}

