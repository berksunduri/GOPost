package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

func TestMigrateFromLegacy_NoLegacyFiles(t *testing.T) {
	dir := t.TempDir()
	migrated, err := MigrateFromLegacy(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if migrated {
		t.Error("should not migrate when no legacy files present")
	}
}

func TestMigrateFromLegacy_Full(t *testing.T) {
	dir := t.TempDir()

	// Populate legacy storage
	legacy := New(dir)
	col := &models.Collection{ID: "c1", Name: "Legacy Collection", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := legacy.SaveCollection(col); err != nil {
		t.Fatalf("save legacy collection: %v", err)
	}
	req := &models.HTTPRequest{
		ID: "r1", Name: "Legacy Request", Method: "GET",
		URL: "https://example.com", CollectionID: "c1",
		Headers: map[string]string{}, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := legacy.SaveRequest(req); err != nil {
		t.Fatalf("save legacy request: %v", err)
	}
	env := &models.Environment{
		ID: "e1", Name: "Staging",
		Variables: map[string]interface{}{"url": "https://staging.example.com"},
		CreatedAt: time.Now(),
	}
	if err := legacy.SaveEnvironment(env); err != nil {
		t.Fatalf("save legacy env: %v", err)
	}
	entry := &models.HistoryEntry{
		ID: "h1", RequestID: "r1", Method: "GET",
		URL: "https://example.com", CreatedAt: time.Now(),
	}
	if err := legacy.SaveHistoryEntry(entry); err != nil {
		t.Fatalf("save legacy history: %v", err)
	}

	migrated, err := MigrateFromLegacy(dir)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if !migrated {
		t.Fatal("expected migration to run")
	}

	// Verify GitStore has the data
	git, err := NewGitStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	cols, _ := git.GetCollections()
	if len(cols) != 1 || cols[0].Name != "Legacy Collection" {
		t.Errorf("migrated collection: %v", cols)
	}
	reqs, _ := git.GetRequests("c1")
	if len(reqs) != 1 || reqs[0].Name != "Legacy Request" {
		t.Errorf("migrated requests: %v", reqs)
	}
	envs, _ := git.GetEnvironments()
	if len(envs) != 1 || envs[0].Name != "Staging" {
		t.Errorf("migrated environments: %v", envs)
	}
	history, _ := git.GetHistory()
	if len(history) != 1 {
		t.Errorf("migrated history: want 1, got %d", len(history))
	}
}

func TestMigrateFromLegacy_BacksUpLegacyFiles(t *testing.T) {
	dir := t.TempDir()
	legacy := New(dir)
	col := &models.Collection{ID: "c1", Name: "Test", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	legacy.SaveCollection(col)

	MigrateFromLegacy(dir)

	// Original file should be renamed
	if _, err := os.Stat(filepath.Join(dir, "collections.json")); err == nil {
		t.Error("original collections.json should be renamed to .legacy.bak")
	}
	if _, err := os.Stat(filepath.Join(dir, "collections.json.legacy.bak")); err != nil {
		t.Errorf("backup file not found: %v", err)
	}
}

func TestMigrateFromLegacy_SkipsWhenGitStorePopulated(t *testing.T) {
	dir := t.TempDir()
	// Pre-populate GitStore
	git, err := NewGitStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	git.SaveCollection(&models.Collection{ID: "g1", Name: "Already Migrated", CreatedAt: time.Now(), UpdatedAt: time.Now()})

	// Also create legacy file
	legacy := New(dir)
	legacy.SaveCollection(&models.Collection{ID: "l1", Name: "Legacy", CreatedAt: time.Now(), UpdatedAt: time.Now()})

	migrated, err := MigrateFromLegacy(dir)
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	if migrated {
		t.Error("should skip migration when GitStore already has data")
	}

	// GitStore should still have only the pre-existing collection
	cols, _ := git.GetCollections()
	if len(cols) != 1 || cols[0].Name != "Already Migrated" {
		t.Errorf("GitStore should be unchanged: %v", cols)
	}
}
