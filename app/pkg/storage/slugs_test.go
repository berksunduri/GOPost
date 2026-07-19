package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

func TestAllocateCollectionID_Slug(t *testing.T) {
	g := newStore(t)
	id := g.AllocateCollectionID("Checkout API")
	if id != "Checkout API" {
		t.Fatalf("want 'Checkout API', got %q", id)
	}
	if err := g.SaveCollection(&models.Collection{
		ID: id, Name: "Checkout API", CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	id2 := g.AllocateCollectionID("Checkout API")
	if id2 == id {
		t.Fatal("second allocation must differ")
	}
}

func TestMigrateUUIDCollectionDirs(t *testing.T) {
	g := newStore(t)
	uuidID := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	colDir := g.collectionDir(uuidID)
	if err := os.MkdirAll(filepath.Join(colDir, "requests"), 0700); err != nil {
		t.Fatal(err)
	}
	manifest := models.CollectionManifest{
		Name: "Payments", Schema: 1, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	data, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(filepath.Join(colDir, "collection.gopost.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	n, err := g.MigrateUUIDCollectionDirs()
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("renamed=%d", n)
	}
	if _, err := os.Stat(g.collectionDir("Payments")); err != nil {
		t.Fatal(err)
	}
}

func TestEnvironmentSlugFilename(t *testing.T) {
	g := newStore(t)
	env := &models.Environment{
		ID: "env-uuid-1", Name: "staging",
		Variables: map[string]interface{}{"k": "v"},
		CreatedAt: time.Now(),
	}
	if err := g.SaveEnvironment(env); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(g.GetBaseDir(), "environments", "staging.gopost.json")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected slug file: %v", err)
	}
}
