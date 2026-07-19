package runner

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gopost/app/pkg/models"
	"gopost/app/pkg/storage"
)

func writeTestCollection(t *testing.T, dataDir, id, name string, reqs []models.RequestFile) {
	t.Helper()
	colDir := filepath.Join(dataDir, "collections", id)
	reqDir := filepath.Join(colDir, "requests")
	if err := os.MkdirAll(reqDir, 0700); err != nil {
		t.Fatal(err)
	}
	manifest := models.CollectionManifest{
		Name: name, Schema: 1,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
		Order: []string{},
	}
	for _, rf := range reqs {
		fn := rf.Name + ".gopost.json"
		manifest.Order = append(manifest.Order, fn)
		data, _ := json.MarshalIndent(rf, "", "  ")
		if err := os.WriteFile(filepath.Join(reqDir, fn), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	data, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(filepath.Join(colDir, "collection.gopost.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
}

func TestLoadRequests_ByDirAndName(t *testing.T) {
	dataDir := t.TempDir()
	writeTestCollection(t, dataDir, "checkout-api", "Checkout API", []models.RequestFile{
		{ID: "r1", Name: "health", Method: "GET", URL: "{{baseUrl}}/health"},
	})

	reqs, name, err := loadRequests(filepath.Join(dataDir, "collections", "checkout-api"), dataDir)
	if err != nil {
		t.Fatalf("by dir: %v", err)
	}
	if name != "Checkout API" || len(reqs) != 1 {
		t.Fatalf("by dir: name=%q n=%d", name, len(reqs))
	}
	if reqs[0].URL != "{{baseUrl}}/health" {
		t.Fatalf("template must stay raw, got %q", reqs[0].URL)
	}

	reqs, name, err = loadRequests("checkout-api", dataDir)
	if err != nil || name != "Checkout API" || len(reqs) != 1 {
		t.Fatalf("by slug: err=%v name=%q n=%d", err, name, len(reqs))
	}

	reqs, name, err = loadRequests("Checkout API", dataDir)
	if err != nil || name != "Checkout API" || len(reqs) != 1 {
		t.Fatalf("by name: err=%v name=%q n=%d", err, name, len(reqs))
	}
}

func TestLoadEnvironment_GopostJSON(t *testing.T) {
	dataDir := t.TempDir()
	envDir := filepath.Join(dataDir, "environments")
	if err := os.MkdirAll(envDir, 0700); err != nil {
		t.Fatal(err)
	}
	env := models.Environment{
		ID: "e1", Name: "ci",
		Variables: map[string]interface{}{"baseUrl": "http://example.test"},
	}
	data, _ := json.MarshalIndent(env, "", "  ")
	if err := os.WriteFile(filepath.Join(envDir, "ci.gopost.json"), data, 0600); err != nil {
		t.Fatal(err)
	}

	got, err := LoadEnvironmentByName(dataDir, "ci")
	if err != nil {
		t.Fatal(err)
	}
	if got.Variables["baseUrl"] != "http://example.test" {
		t.Fatalf("unexpected vars: %+v", got.Variables)
	}

	fromFile, err := LoadEnvironmentFile(filepath.Join(envDir, "ci.gopost.json"))
	if err != nil || fromFile.Name != "ci" {
		t.Fatalf("env-file: err=%v name=%q", err, fromFile.Name)
	}
}

func TestResolveDataDir_UsesExplicit(t *testing.T) {
	dir := t.TempDir()
	got, err := ResolveDataDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(dir)
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestRun_LoadsFromDataDir(t *testing.T) {
	dataDir := t.TempDir()
	writeTestCollection(t, dataDir, "demo", "Demo", []models.RequestFile{
		{ID: "r1", Name: "ping", Method: "GET", URL: "http://127.0.0.1:9/nope"},
	})
	// Ensure store layout exists
	if _, err := storage.NewGitStore(dataDir); err != nil {
		t.Fatal(err)
	}

	result, err := Run(Config{
		CollectionPath: "demo",
		DataDir:        dataDir,
		Timeout:        100 * time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Total != 1 {
		t.Fatalf("total=%d", result.Total)
	}
}
