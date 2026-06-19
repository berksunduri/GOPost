package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

// ==================== Helpers ====================

func newStore(t *testing.T) *GitStore {
	t.Helper()
	return NewGitStore(t.TempDir())
}

func makeCollection(id, name string) *models.Collection {
	return &models.Collection{ID: id, Name: name, CreatedAt: time.Now(), UpdatedAt: time.Now()}
}

func makeRequest(id, name, colID string) *models.HTTPRequest {
	return &models.HTTPRequest{
		ID: id, Name: name, Method: "GET",
		URL: "https://example.com", Headers: map[string]string{},
		CollectionID: colID, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
}

// ==================== Collections ====================

func TestGitStore_SaveAndGetCollection(t *testing.T) {
	g := newStore(t)
	col := makeCollection("c1", "My API")
	if err := g.SaveCollection(col); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := g.GetCollection("c1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Name != "My API" {
		t.Errorf("Name: want 'My API', got %q", got.Name)
	}
}

func TestGitStore_GetCollection_NotFound(t *testing.T) {
	g := newStore(t)
	_, err := g.GetCollection("nonexistent")
	if err == nil {
		t.Error("expected error for missing collection")
	}
}

func TestGitStore_UpdateCollection_NameChange(t *testing.T) {
	g := newStore(t)
	col := makeCollection("c1", "Old")
	g.SaveCollection(col)
	col.Name = "New"
	g.SaveCollection(col)

	got, _ := g.GetCollection("c1")
	if got.Name != "New" {
		t.Errorf("want 'New', got %q", got.Name)
	}
}

func TestGitStore_GetCollections_Empty(t *testing.T) {
	g := newStore(t)
	cols, err := g.GetCollections()
	if err != nil {
		t.Fatalf("get collections: %v", err)
	}
	if len(cols) != 0 {
		t.Errorf("want 0 collections, got %d", len(cols))
	}
}

func TestGitStore_GetCollections_Multiple(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("c1", "Alpha"))
	g.SaveCollection(makeCollection("c2", "Beta"))
	cols, _ := g.GetCollections()
	if len(cols) != 2 {
		t.Errorf("want 2 collections, got %d", len(cols))
	}
}

func TestGitStore_DeleteCollection_RemovesDirectory(t *testing.T) {
	g := newStore(t)
	col := makeCollection("c1", "ToDelete")
	g.SaveCollection(col)

	colDir := g.GetCollectionDir("c1")
	if _, err := os.Stat(colDir); os.IsNotExist(err) {
		t.Fatal("collection dir should exist before delete")
	}

	if err := g.DeleteCollection("c1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := os.Stat(colDir); !os.IsNotExist(err) {
		t.Error("collection dir should be gone after delete")
	}
}

func TestGitStore_DeleteCollection_NotFound(t *testing.T) {
	g := newStore(t)
	err := g.DeleteCollection("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent collection")
	}
}

// ==================== Requests ====================

func TestGitStore_SaveAndGetRequest(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("c1", "API"))
	req := makeRequest("r1", "List Users", "c1")
	if err := g.SaveRequest(req); err != nil {
		t.Fatalf("save request: %v", err)
	}

	got, err := g.GetRequest("r1")
	if err != nil {
		t.Fatalf("get request: %v", err)
	}
	if got.Name != "List Users" {
		t.Errorf("Name: want 'List Users', got %q", got.Name)
	}
	if got.CollectionID != "c1" {
		t.Errorf("CollectionID: want 'c1', got %q", got.CollectionID)
	}
}

func TestGitStore_GetRequest_NotFound(t *testing.T) {
	g := newStore(t)
	_, err := g.GetRequest("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent request")
	}
}

func TestGitStore_GetRequests_RespectsOrder(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("c1", "API"))
	for _, name := range []string{"Alpha", "Beta", "Gamma"} {
		g.SaveRequest(makeRequest(name, name, "c1"))
	}

	reqs, _ := g.GetRequests("c1")
	if len(reqs) != 3 {
		t.Fatalf("want 3 requests, got %d", len(reqs))
	}
	// Order should match insertion order (manifest.Order)
	for i, name := range []string{"Alpha", "Beta", "Gamma"} {
		if reqs[i].Name != name {
			t.Errorf("[%d] want %s, got %s", i, name, reqs[i].Name)
		}
	}
}

func TestGitStore_DeleteRequest_RemovesFile(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("c1", "API"))
	g.SaveRequest(makeRequest("r1", "GetUser", "c1"))

	if err := g.DeleteRequest("r1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	_, err := g.GetRequest("r1")
	if err == nil {
		t.Error("expected error after deletion")
	}
}

func TestGitStore_DeleteRequest_RemovedFromManifestOrder(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("c1", "API"))
	g.SaveRequest(makeRequest("r1", "A", "c1"))
	g.SaveRequest(makeRequest("r2", "B", "c1"))
	g.DeleteRequest("r1")

	reqs, _ := g.GetRequests("c1")
	if len(reqs) != 1 || reqs[0].Name != "B" {
		t.Errorf("after delete, want [B], got %v", reqs)
	}
}

func TestGitStore_Request_RenameUpdatesFile(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("c1", "API"))
	req := makeRequest("r1", "OldName", "c1")
	g.SaveRequest(req)

	req.Name = "NewName"
	g.SaveRequest(req)

	reqDir := filepath.Join(g.GetCollectionDir("c1"), "requests")
	entries, _ := os.ReadDir(reqDir)

	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}

	for _, n := range names {
		if strings.Contains(n, "OldName") {
			t.Errorf("old file %q should have been removed", n)
		}
	}
	found := false
	for _, n := range names {
		if strings.Contains(n, "NewName") {
			found = true
		}
	}
	if !found {
		t.Errorf("new file for 'NewName' not found, files: %v", names)
	}
}

func TestGitStore_GetAllRequests_AcrossCollections(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("c1", "API1"))
	g.SaveCollection(makeCollection("c2", "API2"))
	g.SaveRequest(makeRequest("r1", "One", "c1"))
	g.SaveRequest(makeRequest("r2", "Two", "c2"))

	all, err := g.GetAllRequests()
	if err != nil {
		t.Fatalf("get all: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("want 2, got %d", len(all))
	}
}

func TestGitStore_MoveRequest_ChangesCollection(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("src", "Source"))
	g.SaveCollection(makeCollection("dst", "Destination"))
	req := makeRequest("r1", "Movable", "src")
	g.SaveRequest(req)

	// Move to dst
	req.CollectionID = "dst"
	g.SaveRequest(req)
	g.DeleteRequestFromCollection("r1", "src")

	srcReqs, _ := g.GetRequests("src")
	if len(srcReqs) != 0 {
		t.Errorf("source should have 0 requests after move, got %d", len(srcReqs))
	}
	dstReqs, _ := g.GetRequests("dst")
	if len(dstReqs) != 1 {
		t.Errorf("destination should have 1 request, got %d", len(dstReqs))
	}
}

// ==================== Environments ====================

func TestGitStore_EnvironmentCRUD(t *testing.T) {
	g := newStore(t)
	env := &models.Environment{
		ID: "env1", Name: "Production",
		Variables: map[string]interface{}{"base_url": "https://api.example.com"},
		CreatedAt: time.Now(),
	}
	if err := g.SaveEnvironment(env); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := g.GetEnvironment("env1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Name != "Production" {
		t.Errorf("Name: want 'Production', got %q", got.Name)
	}
	if got.Variables["base_url"] != "https://api.example.com" {
		t.Errorf("variable mismatch")
	}

	if err := g.DeleteEnvironment("env1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	_, err = g.GetEnvironment("env1")
	if err == nil {
		t.Error("expected error after delete")
	}
}

func TestGitStore_GetEnvironments_Empty(t *testing.T) {
	g := newStore(t)
	envs, err := g.GetEnvironments()
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(envs) != 0 {
		t.Errorf("want 0 environments, got %d", len(envs))
	}
}

// ==================== History ====================

func TestGitStore_History_PrependsMostRecent(t *testing.T) {
	g := newStore(t)
	for _, id := range []string{"first", "second", "third"} {
		g.SaveHistoryEntry(&models.HistoryEntry{
			ID: id, RequestID: "r1", Method: "GET", URL: "https://example.com", CreatedAt: time.Now(),
		})
	}
	h, _ := g.GetHistory()
	if h[0].ID != "third" {
		t.Errorf("most recent first: want 'third', got %q", h[0].ID)
	}
}

func TestGitStore_History_CapAt500(t *testing.T) {
	g := newStore(t)
	for i := 0; i < 510; i++ {
		g.SaveHistoryEntry(&models.HistoryEntry{
			ID: fmt.Sprintf("h%d", i), RequestID: "r1",
			Method: "GET", URL: "https://example.com", CreatedAt: time.Now(),
		})
	}
	h, _ := g.GetHistory()
	if len(h) != 500 {
		t.Errorf("want cap 500, got %d", len(h))
	}
}

func TestGitStore_DeleteHistoryEntriesForCollection(t *testing.T) {
	g := newStore(t)
	g.SaveHistoryEntry(&models.HistoryEntry{ID: "h1", CollectionID: "colA", Method: "GET", URL: "https://a.com", CreatedAt: time.Now()})
	g.SaveHistoryEntry(&models.HistoryEntry{ID: "h2", CollectionID: "colB", Method: "GET", URL: "https://b.com", CreatedAt: time.Now()})
	g.SaveHistoryEntry(&models.HistoryEntry{ID: "h3", CollectionID: "colA", Method: "GET", URL: "https://a.com/2", CreatedAt: time.Now()})

	if err := g.DeleteHistoryEntriesForCollection("colA"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	h, _ := g.GetHistory()
	if len(h) != 1 || h[0].CollectionID != "colB" {
		t.Errorf("want only colB entry remaining, got %v", h)
	}
}

// ==================== UserConfig ====================

func TestGitStore_UserConfig_DefaultsWhenMissing(t *testing.T) {
	g := newStore(t)
	cfg, err := g.GetUserConfig()
	if err != nil {
		t.Fatalf("get config: %v", err)
	}
	if cfg.ThemeID != "github-dark" {
		t.Errorf("default theme: want 'github-dark', got %q", cfg.ThemeID)
	}
	if cfg.Shortcuts == nil {
		t.Error("default shortcuts map should not be nil")
	}
}

func TestGitStore_UserConfig_PersistsAndLoads(t *testing.T) {
	g := newStore(t)
	cfg := &models.UserConfig{
		ThemeID:   "solarized-light",
		Shortcuts: map[string][]string{"send": {"mod", "Enter"}},
	}
	if err := g.SaveUserConfig(cfg); err != nil {
		t.Fatalf("save: %v", err)
	}
	loaded, err := g.GetUserConfig()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.ThemeID != "solarized-light" {
		t.Errorf("ThemeID: want 'solarized-light', got %q", loaded.ThemeID)
	}
	if len(loaded.Shortcuts["send"]) != 2 {
		t.Errorf("shortcuts: want 2 keys, got %v", loaded.Shortcuts["send"])
	}
}

// ==================== ReplaceAllData (import) ====================

func TestGitStore_ReplaceAllData_ClearsAndImports(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("old", "OldCollection"))
	g.SaveRequest(makeRequest("r-old", "OldRequest", "old"))

	data := &models.ExportData{
		Version: 1,
		Collections: []models.Collection{
			{ID: "new1", Name: "Imported1", CreatedAt: time.Now(), UpdatedAt: time.Now()},
			{ID: "new2", Name: "Imported2", CreatedAt: time.Now(), UpdatedAt: time.Now()},
		},
		Requests: []models.HTTPRequest{
			{ID: "r-new", Name: "NewReq", Method: "GET", URL: "https://imported.com",
				CollectionID: "new1", Headers: map[string]string{}, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		},
	}

	if err := g.ReplaceAllData(data); err != nil {
		t.Fatalf("replace: %v", err)
	}

	cols, _ := g.GetCollections()
	if len(cols) != 2 {
		t.Errorf("want 2 collections after import, got %d", len(cols))
	}

	_, err := g.GetCollection("old")
	if err == nil {
		t.Error("old collection should be gone after replace")
	}

	reqs, _ := g.GetRequests("new1")
	if len(reqs) != 1 || reqs[0].Name != "NewReq" {
		t.Errorf("imported request not found: %v", reqs)
	}
}

// ==================== RunHistory ====================

func TestGitStore_RunHistory_SaveAndGet(t *testing.T) {
	g := newStore(t)
	report := map[string]interface{}{
		"collection_name": "My API",
		"total":           3,
		"passed":          2,
		"failed":          1,
	}
	if err := g.SaveRunReport("c1", report); err != nil {
		t.Fatalf("save: %v", err)
	}

	history, err := g.GetRunHistory("c1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("want 1 run, got %d", len(history))
	}
	if history[0]["collection_name"] != "My API" {
		t.Errorf("collection_name mismatch: %v", history[0]["collection_name"])
	}
}

func TestGitStore_RunHistory_EmptyWhenNone(t *testing.T) {
	g := newStore(t)
	history, err := g.GetRunHistory("c1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(history) != 0 {
		t.Errorf("want 0 runs, got %d", len(history))
	}
}

// ==================== sanitizeName ====================

func TestSanitizeName_RemovesInvalidChars(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"normal-name", "normal-name"},
		{"path/with/slashes", "path-with-slashes"},
		{"colon:name", "colon-name"},
		{"star*name", "starname"},
		{"question?name", "questionname"},
		{`back\slash`, "back-slash"},
		{`"quoted"`, "quoted"},
		{"<angle>", "angle"},
		{"pipe|name", "pipename"},
	}
	for _, tc := range cases {
		got := sanitizeName(tc.input)
		if got != tc.want {
			t.Errorf("sanitizeName(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

// ==================== Concurrent writes ====================

func TestGitStore_ConcurrentSaveRequests(t *testing.T) {
	g := newStore(t)
	g.SaveCollection(makeCollection("c1", "Concurrent"))

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			req := makeRequest(fmt.Sprintf("r%d", i), fmt.Sprintf("Request%d", i), "c1")
			if err := g.SaveRequest(req); err != nil {
				t.Errorf("concurrent save %d: %v", i, err)
			}
		}(i)
	}
	wg.Wait()

	reqs, err := g.GetRequests("c1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(reqs) != 20 {
		t.Errorf("concurrent writes: want 20 requests, got %d", len(reqs))
	}
}
