package storage

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

func TestDeleteCollectionCascadesRequests(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	collection := &models.Collection{ID: "collection-1", Name: "Collection", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := store.SaveCollection(collection); err != nil {
		t.Fatalf("save collection: %v", err)
	}

	request := &models.HTTPRequest{ID: "request-1", Name: "Req", CollectionID: collection.ID, Method: "GET", URL: "https://example.com", Headers: map[string]string{}}
	if err := store.SaveRequest(request); err != nil {
		t.Fatalf("save request: %v", err)
	}

	if err := store.DeleteCollection(collection.ID); err != nil {
		t.Fatalf("delete collection: %v", err)
	}

	requests, err := store.GetAllRequests()
	if err != nil {
		t.Fatalf("get requests: %v", err)
	}
	if len(requests) != 0 {
		t.Fatalf("expected requests to be deleted, got %d", len(requests))
	}
}

func TestHistoryAndReplaceData(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	entry := &models.HistoryEntry{
		ID:        "history-1",
		RequestID: "request-1",
		Method:    "GET",
		URL:       "https://example.com",
		Status:    "200 OK",
		Code:      200,
		TimeMs:    5,
		CreatedAt: time.Now(),
	}
	if err := store.SaveHistoryEntry(entry); err != nil {
		t.Fatalf("save history: %v", err)
	}

	history, err := store.GetHistory()
	if err != nil {
		t.Fatalf("get history: %v", err)
	}
	if len(history) != 1 {
		t.Fatalf("expected 1 history entry, got %d", len(history))
	}

	exportData := &models.ExportData{
		Version: 1,
		Collections: []models.Collection{
			{ID: "collection-2", Name: "Imported", CreatedAt: time.Now(), UpdatedAt: time.Now()},
		},
	}
	if err := store.ReplaceAllData(exportData); err != nil {
		t.Fatalf("replace data: %v", err)
	}

	collections, err := store.GetCollections()
	if err != nil {
		t.Fatalf("get collections: %v", err)
	}
	if len(collections) != 1 || collections[0].Name != "Imported" {
		t.Fatalf("unexpected collections after replace: %+v", collections)
	}

	if _, err := filepath.Abs(tmpDir); err != nil {
		t.Fatalf("tmp dir should be valid: %v", err)
	}
}

func TestSaveAndGetCollection(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	col := &models.Collection{ID: "c1", Name: "API Tests", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := store.SaveCollection(col); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := store.GetCollection("c1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Name != "API Tests" {
		t.Errorf("Name: want 'API Tests', got %q", got.Name)
	}
}

func TestUpdateCollection(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	col := &models.Collection{ID: "c2", Name: "Old Name", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	store.SaveCollection(col)

	col.Name = "New Name"
	store.SaveCollection(col)

	got, err := store.GetCollection("c2")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Name != "New Name" {
		t.Errorf("want 'New Name', got %q", got.Name)
	}

	cols, _ := store.GetCollections()
	if len(cols) != 1 {
		t.Errorf("update should not duplicate: got %d collections", len(cols))
	}
}

func TestGetCollectionNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	_, err := store.GetCollection("nonexistent")
	if err == nil {
		t.Error("want error for nonexistent collection")
	}
}

func TestSaveGetDeleteRequest(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	req := &models.HTTPRequest{
		ID:           "r1",
		Name:         "List Users",
		Method:       "GET",
		URL:          "https://example.com/users",
		CollectionID: "col-1",
		Headers:      map[string]string{},
	}
	if err := store.SaveRequest(req); err != nil {
		t.Fatalf("save request: %v", err)
	}

	got, err := store.GetRequest("r1")
	if err != nil {
		t.Fatalf("get request: %v", err)
	}
	if got.Name != "List Users" {
		t.Errorf("Name: want 'List Users', got %q", got.Name)
	}

	if err := store.DeleteRequest("r1"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err = store.GetRequest("r1")
	if err == nil {
		t.Error("want error after deletion")
	}
}

func TestGetRequestsByCollection(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	for i, colID := range []string{"col-A", "col-A", "col-B"} {
		req := &models.HTTPRequest{
			ID:           filepath.Join(colID, fmt.Sprintf("r%d", i)),
			Name:         fmt.Sprintf("Request %d", i),
			Method:       "GET",
			URL:          "https://example.com",
			CollectionID: colID,
			Headers:      map[string]string{},
		}
		store.SaveRequest(req)
	}

	reqs, err := store.GetRequests("col-A")
	if err != nil {
		t.Fatalf("get requests: %v", err)
	}
	if len(reqs) != 2 {
		t.Errorf("want 2 requests for col-A, got %d", len(reqs))
	}
}

func TestEnvironmentCRUD(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	env := &models.Environment{
		ID:        "env-1",
		Name:      "Staging",
		Variables: map[string]interface{}{"base_url": "https://staging.example.com"},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := store.SaveEnvironment(env); err != nil {
		t.Fatalf("save env: %v", err)
	}

	got, err := store.GetEnvironment("env-1")
	if err != nil {
		t.Fatalf("get env: %v", err)
	}
	if got.Name != "Staging" {
		t.Errorf("Name: want 'Staging', got %q", got.Name)
	}
	if got.Variables["base_url"] != "https://staging.example.com" {
		t.Errorf("variable mismatch: got %v", got.Variables["base_url"])
	}

	if err := store.DeleteEnvironment("env-1"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	envs, _ := store.GetEnvironments()
	if len(envs) != 0 {
		t.Errorf("want 0 environments after deletion, got %d", len(envs))
	}
}

func TestHistoryCapAt500(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	for i := 0; i < 510; i++ {
		entry := &models.HistoryEntry{
			ID:        fmt.Sprintf("h%d", i),
			RequestID: "r1",
			Method:    "GET",
			URL:       "https://example.com",
			CreatedAt: time.Now(),
		}
		if err := store.SaveHistoryEntry(entry); err != nil {
			t.Fatalf("save entry %d: %v", i, err)
		}
	}

	history, err := store.GetHistory()
	if err != nil {
		t.Fatalf("get history: %v", err)
	}
	if len(history) != 500 {
		t.Errorf("history cap: want 500, got %d", len(history))
	}
}

func TestHistoryOrderedMostRecentFirst(t *testing.T) {
	tmpDir := t.TempDir()
	store := New(tmpDir)

	for _, id := range []string{"first", "second", "third"} {
		store.SaveHistoryEntry(&models.HistoryEntry{
			ID:        id,
			RequestID: "r1",
			Method:    "GET",
			URL:       "https://example.com",
			CreatedAt: time.Now(),
		})
	}

	history, _ := store.GetHistory()
	if history[0].ID != "third" {
		t.Errorf("most recent first: want 'third' at [0], got %q", history[0].ID)
	}
}
