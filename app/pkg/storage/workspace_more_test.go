package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

func TestValidateWorkspaceDir(t *testing.T) {
	dir := t.TempDir()
	got, err := ValidateWorkspaceDir(filepath.Join(dir, "nested"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(got); err != nil {
		t.Fatal(err)
	}
}

func TestResolveWorkspaceDir_Default(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	_ = os.Unsetenv(envDataDir)
	got, err := ResolveWorkspaceDir("")
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, ".gopost")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestRenameCollectionDir(t *testing.T) {
	g := newStore(t)
	if err := g.SaveCollection(&models.Collection{
		ID: "Old", Name: "Old", CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	newID, err := g.RenameCollectionDir("Old", "New")
	if err != nil {
		t.Fatal(err)
	}
	if newID != "New" {
		t.Fatalf("got %q", newID)
	}
	if _, err := os.Stat(g.collectionDir("New")); err != nil {
		t.Fatal(err)
	}
}

func TestMigrateEnvironmentFilesToSlugs(t *testing.T) {
	g := newStore(t)
	envDir := filepath.Join(g.GetBaseDir(), "environments")
	id := "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	env := models.Environment{ID: id, Name: "prod", Variables: map[string]interface{}{"a": "1"}}
	data, _ := json.MarshalIndent(env, "", "  ")
	old := filepath.Join(envDir, id+".gopost.json")
	if err := os.WriteFile(old, data, 0600); err != nil {
		t.Fatal(err)
	}
	n, err := g.MigrateEnvironmentFilesToSlugs()
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("n=%d", n)
	}
	if _, err := os.Stat(filepath.Join(envDir, "prod.gopost.json")); err != nil {
		t.Fatal(err)
	}
}

func TestEnvironmentUpdateRenamesSlugFile(t *testing.T) {
	g := newStore(t)
	env := &models.Environment{
		ID: "e1", Name: "dev", Variables: map[string]interface{}{}, CreatedAt: time.Now(),
	}
	if err := g.SaveEnvironment(env); err != nil {
		t.Fatal(err)
	}
	env.Name = "prod"
	if err := g.SaveEnvironment(env); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(g.GetBaseDir(), "environments", "prod.gopost.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(g.GetBaseDir(), "environments", "dev.gopost.json")); !os.IsNotExist(err) {
		t.Fatalf("old slug should be gone: %v", err)
	}
}
