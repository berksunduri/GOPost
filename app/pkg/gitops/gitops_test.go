package gitops

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// setupRepoWithCommit initializes a plain git repo and makes an initial commit
// with a single tracked file, bypassing .gitignore so tests work reliably.
func setupRepoWithCommit(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	repo, err := git.PlainInit(dir, false)
	if err != nil {
		t.Fatalf("git init: %v", err)
	}

	os.WriteFile(filepath.Join(dir, "collection.gopost.json"), []byte(`{"id":"test"}`), 0644)
	wt, _ := repo.Worktree()
	wt.Add("collection.gopost.json")
	_, err = wt.Commit("Initial commit", &git.CommitOptions{
		Author: &object.Signature{Name: "GoPost", Email: "gopost@local", When: time.Now()},
	})
	if err != nil {
		t.Fatalf("initial commit: %v", err)
	}
	return dir
}

// addTrackedFile writes a file and stages it without going through .gitignore.
func addTrackedFile(t *testing.T, dir, name, content string) {
	t.Helper()
	os.WriteFile(filepath.Join(dir, name), []byte(content), 0644)
	repo, _ := git.PlainOpen(dir)
	wt, _ := repo.Worktree()
	wt.Add(name)
}

// ==================== InitRepo ====================

func TestInitRepo_CreatesRepo(t *testing.T) {
	dir := t.TempDir()
	if err := InitRepo(dir); err != nil {
		t.Fatalf("InitRepo: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".git")); err != nil {
		t.Error(".git directory should exist after InitRepo")
	}
}

func TestInitRepo_CreatesGitignore(t *testing.T) {
	dir := t.TempDir()
	InitRepo(dir)
	if _, err := os.Stat(filepath.Join(dir, ".gitignore")); err != nil {
		t.Error(".gitignore should be created by InitRepo")
	}
}

func TestInitRepo_Idempotent(t *testing.T) {
	dir := t.TempDir()
	if err := InitRepo(dir); err != nil {
		t.Fatalf("first init: %v", err)
	}
	if err := InitRepo(dir); err != nil {
		t.Fatalf("second init (idempotent): %v", err)
	}
}

func TestInitRepo_ReturnsNilOnAlreadyExistingRepo(t *testing.T) {
	dir := setupRepoWithCommit(t)
	if err := InitRepo(dir); err != nil {
		t.Errorf("InitRepo on existing repo should not error: %v", err)
	}
}

// ==================== Status ====================

func TestStatus_NotARepo(t *testing.T) {
	dir := t.TempDir()
	result, err := Status(dir)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if result.IsRepo {
		t.Error("IsRepo should be false for plain directory")
	}
}

func TestStatus_AfterInit(t *testing.T) {
	dir := setupRepoWithCommit(t)

	result, err := Status(dir)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if !result.IsRepo {
		t.Error("IsRepo should be true for a git repo")
	}
}

func TestStatus_CommitCount(t *testing.T) {
	dir := setupRepoWithCommit(t)

	result, err := Status(dir)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if result.CommitCount < 1 {
		t.Errorf("CommitCount should be >= 1, got %d", result.CommitCount)
	}
}

func TestStatus_BranchName(t *testing.T) {
	dir := setupRepoWithCommit(t)

	result, _ := Status(dir)
	if result.Branch == "" {
		t.Error("Branch should be set after init with a commit")
	}
}

func TestStatus_LastAuthorIsGoPost(t *testing.T) {
	dir := setupRepoWithCommit(t)

	result, _ := Status(dir)
	if result.LastAuthor != "GoPost" {
		t.Errorf("LastAuthor: want 'GoPost', got %q", result.LastAuthor)
	}
}

func TestStatus_DetectsNewFile(t *testing.T) {
	dir := setupRepoWithCommit(t)

	// Add a file directly, bypassing gitignore
	os.WriteFile(filepath.Join(dir, "new_file.txt"), []byte("hello"), 0644)

	result, err := Status(dir)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if !result.HasChanges {
		t.Error("HasChanges should be true after writing a new untracked file")
	}
}

func TestStatus_NoChanges_AfterCleanRepo(t *testing.T) {
	dir := setupRepoWithCommit(t)

	result, err := Status(dir)
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if result.HasChanges {
		t.Error("HasChanges should be false for clean repo")
	}
}

func TestStatus_HasCommitsInLog(t *testing.T) {
	dir := setupRepoWithCommit(t)

	result, _ := Status(dir)
	if len(result.Commits) == 0 {
		t.Error("Commits slice should not be empty")
	}
}

// ==================== Commit ====================

func TestCommit_CreatesCommit(t *testing.T) {
	dir := setupRepoWithCommit(t)

	addTrackedFile(t, dir, "request.json", `{"id":"r1"}`)

	if err := Commit(dir, "add request"); err != nil {
		t.Fatalf("commit: %v", err)
	}

	result, _ := Status(dir)
	if result.CommitCount < 2 {
		t.Errorf("expected at least 2 commits, got %d", result.CommitCount)
	}
}

func TestCommit_ClearsChanges(t *testing.T) {
	dir := setupRepoWithCommit(t)

	addTrackedFile(t, dir, "request.json", `{}`)
	Commit(dir, "add request")

	result, _ := Status(dir)
	if result.HasChanges {
		t.Error("HasChanges should be false after commit")
	}
}

func TestCommit_LastCommitMessage(t *testing.T) {
	dir := setupRepoWithCommit(t)

	addTrackedFile(t, dir, "r.json", `{}`)
	Commit(dir, "my commit message")

	result, _ := Status(dir)
	if result.LastCommit != "my commit message" {
		t.Errorf("LastCommit: want 'my commit message', got %q", result.LastCommit)
	}
}

func TestCommit_NotARepo(t *testing.T) {
	dir := t.TempDir()
	err := Commit(dir, "orphan")
	if err == nil {
		t.Error("commit on non-repo should return error")
	}
}

func TestCommit_NothingToCommit(t *testing.T) {
	dir := setupRepoWithCommit(t)
	// No changes - commit should fail
	err := Commit(dir, "empty")
	if err == nil {
		t.Error("commit with nothing to stage should return error")
	}
}

// ==================== Log ====================

func TestLog_ReturnsCommits(t *testing.T) {
	dir := setupRepoWithCommit(t)

	addTrackedFile(t, dir, "a.json", `{}`)
	Commit(dir, "commit one")
	addTrackedFile(t, dir, "b.json", `{}`)
	Commit(dir, "commit two")

	entries, err := Log(dir)
	if err != nil {
		t.Fatalf("log: %v", err)
	}
	if len(entries) < 3 {
		t.Errorf("expected at least 3 log entries, got %d", len(entries))
	}
	// Most recent first
	if entries[0].Message != "commit two" {
		t.Errorf("most recent commit should be first, got %q", entries[0].Message)
	}
}

func TestLog_NotARepo(t *testing.T) {
	dir := t.TempDir()
	_, err := Log(dir)
	if err == nil {
		t.Error("log on non-repo should return error")
	}
}

func TestLog_HashIsSeven(t *testing.T) {
	dir := setupRepoWithCommit(t)

	entries, _ := Log(dir)
	if len(entries) == 0 {
		t.Fatal("no log entries")
	}
	if len(entries[0].Hash) != 7 {
		t.Errorf("hash should be 7 chars, got %d: %q", len(entries[0].Hash), entries[0].Hash)
	}
}

func TestLog_EntryAuthor(t *testing.T) {
	dir := setupRepoWithCommit(t)

	entries, _ := Log(dir)
	if len(entries) == 0 {
		t.Fatal("no log entries")
	}
	if entries[0].Author != "GoPost" {
		t.Errorf("Author: want 'GoPost', got %q", entries[0].Author)
	}
}

func TestLog_EntryTimeIsNotEmpty(t *testing.T) {
	dir := setupRepoWithCommit(t)

	entries, _ := Log(dir)
	if len(entries) == 0 {
		t.Fatal("no log entries")
	}
	if entries[0].Time == "" {
		t.Error("Time should not be empty")
	}
}

// ==================== AddRemote ====================

func TestAddRemote_AddsAndReplaces(t *testing.T) {
	dir := setupRepoWithCommit(t)

	if err := AddRemote(dir, "origin", "https://github.com/example/repo.git"); err != nil {
		t.Fatalf("add remote: %v", err)
	}

	result, _ := Status(dir)
	if !result.HasRemote {
		t.Error("HasRemote should be true after AddRemote")
	}
	if result.RemoteURL != "https://github.com/example/repo.git" {
		t.Errorf("RemoteURL: want the set URL, got %q", result.RemoteURL)
	}

	// Replace existing remote
	if err := AddRemote(dir, "origin", "https://github.com/example/new.git"); err != nil {
		t.Fatalf("replace remote: %v", err)
	}
	result, _ = Status(dir)
	if result.RemoteURL != "https://github.com/example/new.git" {
		t.Errorf("RemoteURL after replace: got %q", result.RemoteURL)
	}
}

func TestAddRemote_NotARepo(t *testing.T) {
	dir := t.TempDir()
	err := AddRemote(dir, "origin", "https://github.com/example/repo.git")
	if err == nil {
		t.Error("AddRemote on non-repo should return error")
	}
}

func TestPushPull_LocalBareRemote(t *testing.T) {
	src := setupRepoWithCommit(t)

	bare := t.TempDir()
	if _, err := git.PlainInit(bare, true); err != nil {
		t.Fatalf("bare init: %v", err)
	}
	if err := AddRemote(src, "origin", bare); err != nil {
		t.Fatalf("add remote: %v", err)
	}
	if err := Push(src, "origin", ""); err != nil {
		t.Fatalf("push: %v", err)
	}

	dst := t.TempDir()
	if _, err := git.PlainClone(dst, false, &git.CloneOptions{URL: bare}); err != nil {
		t.Fatalf("clone: %v", err)
	}

	if err := os.WriteFile(filepath.Join(src, "collection.gopost.json"), []byte(`{"id":"v2"}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := Commit(src, "update"); err != nil {
		t.Fatalf("commit2: %v", err)
	}
	if err := Push(src, "origin", ""); err != nil {
		t.Fatalf("push2: %v", err)
	}

	if err := Pull(dst, "origin"); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "up-to-date") &&
			!strings.Contains(strings.ToLower(err.Error()), "up to date") {
			t.Fatalf("pull: %v", err)
		}
	}
	data, err := os.ReadFile(filepath.Join(dst, "collection.gopost.json"))
	if err != nil {
		t.Fatalf("read pulled file: %v", err)
	}
	if !strings.Contains(string(data), "v2") {
		t.Errorf("pull did not update file: %s", data)
	}
}
