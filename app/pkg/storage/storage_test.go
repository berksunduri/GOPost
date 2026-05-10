package storage

import (
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
