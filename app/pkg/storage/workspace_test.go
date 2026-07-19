package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveWorkspaceDir_Explicit(t *testing.T) {
	dir := t.TempDir()
	got, err := ResolveWorkspaceDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(dir)
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResolveWorkspaceDir_Env(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(envDataDir, dir)
	got, err := ResolveWorkspaceDir("")
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(dir)
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestWorkspacePointer_RoundTrip(t *testing.T) {
	// Isolate global app data under temp home.
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.Unsetenv(envDataDir); err != nil {
		t.Fatal(err)
	}

	ws := filepath.Join(home, "my-ws")
	if err := os.MkdirAll(ws, 0700); err != nil {
		t.Fatal(err)
	}
	if err := SaveWorkspacePointer(ws); err != nil {
		t.Fatal(err)
	}
	got, err := LoadWorkspacePointer()
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.Abs(ws)
	if got != want {
		t.Fatalf("pointer got %q want %q", got, want)
	}

	resolved, err := ResolveWorkspaceDir("")
	if err != nil {
		t.Fatal(err)
	}
	if resolved != want {
		t.Fatalf("resolve got %q want %q", resolved, want)
	}
}

func TestWriteWorkspaceGitignore_Idempotent(t *testing.T) {
	dir := t.TempDir()
	if err := WriteWorkspaceGitignore(dir); err != nil {
		t.Fatal(err)
	}
	if err := WriteWorkspaceGitignore(dir); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, ".gitignore"))
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 {
		t.Fatal("expected gitignore content")
	}
}
