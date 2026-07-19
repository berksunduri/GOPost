package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

func TestGetRequests_ScanWithoutOrder(t *testing.T) {
	g := newStore(t)
	id := "scan-me"
	reqDir := filepath.Join(g.collectionDir(id), "requests")
	if err := os.MkdirAll(reqDir, 0700); err != nil {
		t.Fatal(err)
	}
	manifest := models.CollectionManifest{Name: "Scan", Schema: 1, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	data, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(filepath.Join(g.collectionDir(id), "collection.gopost.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	rf := models.RequestFile{ID: "r1", Name: "listed", Method: "GET", URL: "http://x"}
	rdata, _ := json.MarshalIndent(rf, "", "  ")
	if err := os.WriteFile(filepath.Join(reqDir, "listed.gopost.json"), rdata, 0600); err != nil {
		t.Fatal(err)
	}
	reqs, err := g.GetRequests(id)
	if err != nil {
		t.Fatal(err)
	}
	if len(reqs) != 1 || reqs[0].Name != "listed" {
		t.Fatalf("%+v", reqs)
	}
}

func TestSanitizeName_Export(t *testing.T) {
	if SanitizeName("../x") == "../x" {
		t.Fatal("should sanitize")
	}
	if SanitizeName("") != "unnamed" {
		t.Fatal("empty")
	}
}

func TestLoadWorkspacePointer_Corrupt(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	path, err := workspacePointerPath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{"), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := LoadWorkspacePointer()
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("want empty, got %q", got)
	}
}
