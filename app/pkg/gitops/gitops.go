package gitops

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// StatusResult describes the Git state of a collection.
type StatusResult struct {
	IsRepo      bool          `json:"is_repo"`
	Branch      string        `json:"branch,omitempty"`
	HasChanges  bool          `json:"has_changes"`
	Files       []FileStatus  `json:"files"`
	LastCommit  string        `json:"last_commit,omitempty"`
	LastAuthor  string        `json:"last_author,omitempty"`
	LastTime    string        `json:"last_time,omitempty"`
	CommitCount int           `json:"commit_count"`
	HasRemote   bool          `json:"has_remote"`
	RemoteURL   string        `json:"remote_url,omitempty"`
	Commits     []CommitEntry `json:"commits,omitempty"`
}

// FileStatus describes a single file's change status.
type FileStatus struct {
	Path   string `json:"path"`
	Status string `json:"status"` // "added", "modified", "deleted"
}

// CommitEntry is a single commit in the history.
type CommitEntry struct {
	Hash    string `json:"hash"`
	Message string `json:"message"`
	Author  string `json:"author"`
	Time    string `json:"time"`
}

// InitRepo initializes a Git repository and creates an initial commit.
// If a repo already exists, it's a no-op (returns nil).
func InitRepo(collectionDir string) error {
	isNew := false
	if _, err := git.PlainOpen(collectionDir); err != nil {
		// Remove potentially corrupted .git and re-init
		os.RemoveAll(filepath.Join(collectionDir, ".git"))
		if _, err := git.PlainInit(collectionDir, false); err != nil {
			return fmt.Errorf("git init: %w", err)
		}
		isNew = true
	}

	// Create .gitignore if missing
	gitignore := filepath.Join(collectionDir, ".gitignore")
	if _, err := os.Stat(gitignore); os.IsNotExist(err) {
		content := "# GoPost collection\n" +
			"# Track collection metadata and request files\n" +
			"!collection.gopost.json\n" +
			"!requests/*.gopost.json\n" +
			"*\n"
		os.WriteFile(gitignore, []byte(content), 0600)
	}

	// Create initial commit if this is a fresh repo
	if isNew {
		repo, err := git.PlainOpen(collectionDir)
		if err != nil {
			return fmt.Errorf("git init: open after init: %w", err)
		}
		wt, err := repo.Worktree()
		if err != nil {
			return fmt.Errorf("git init: worktree: %w", err)
		}
		if err := wt.AddWithOptions(&git.AddOptions{All: true}); err != nil {
			return fmt.Errorf("git init: add: %w", err)
		}
		// Commit may fail if nothing is staged (e.g. empty repo with .gitignore
		// that excludes everything). This is non-fatal — the repo is ready.
		_, _ = wt.Commit("Initial commit — GoPost collection", &git.CommitOptions{
			Author: &object.Signature{Name: "GoPost", Email: "gopost@local", When: time.Now()},
		})
	}

	return nil
}

// Status returns the Git status for a collection directory.
func Status(collectionDir string) (*StatusResult, error) {
	repo, err := git.PlainOpen(collectionDir)
	if err != nil {
		return &StatusResult{IsRepo: false}, nil
	}

	wt, err := repo.Worktree()
	if err != nil {
		return nil, fmt.Errorf("worktree: %w", err)
	}

	status, err := wt.Status()
	if err != nil {
		return nil, fmt.Errorf("status: %w", err)
	}

	result := &StatusResult{
		IsRepo: true,
		Files:  []FileStatus{},
	}

	for path, s := range status {
		// Skip .git directory and .gitignore
		if strings.HasPrefix(path, ".git") {
			continue
		}
		st := ""
		switch {
		case s.Worktree == git.Added:
			st = "added"
		case s.Worktree == git.Modified:
			st = "modified"
		case s.Worktree == git.Deleted:
			st = "deleted"
		default:
			st = string(s.Worktree)
		}
		result.Files = append(result.Files, FileStatus{Path: path, Status: st})
	}

	result.HasChanges = len(result.Files) > 0

	// Branch name
	if head, err := repo.Head(); err == nil {
		result.Branch = head.Name().Short()
		if commit, err := repo.CommitObject(head.Hash()); err == nil {
			result.LastCommit = commit.Message
			result.LastAuthor = commit.Author.Name
			result.LastTime = commit.Author.When.Format(time.RFC822)
		}
	}

	// Remote info
	if remotes, err := repo.Remotes(); err == nil && len(remotes) > 0 {
		result.HasRemote = true
		if urls := remotes[0].Config().URLs; len(urls) > 0 {
			result.RemoteURL = urls[0]
		}
	}

	// Commit history (last 10)
	iter, err := repo.Log(&git.LogOptions{})
	if err == nil {
		count := 0
		iter.ForEach(func(c *object.Commit) error {
			count++
			if len(result.Commits) < 10 {
				result.Commits = append(result.Commits, CommitEntry{
					Hash:    c.Hash.String()[:7],
					Message: c.Message,
					Author:  c.Author.Name,
					Time:    c.Author.When.Format("Jan 2, 15:04"),
				})
			}
			return nil
		})
		result.CommitCount = count
	}

	return result, nil
}

// Commit stages all changes and creates a commit with the given message.
func Commit(collectionDir, message string) error {
	repo, err := git.PlainOpen(collectionDir)
	if err != nil {
		return fmt.Errorf("open repo: %w", err)
	}

	wt, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("worktree: %w", err)
	}

	// Stage everything
	if err := wt.AddWithOptions(&git.AddOptions{All: true}); err != nil {
		return fmt.Errorf("add: %w", err)
	}

	// Commit
	_, err = wt.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  "GoPost",
			Email: "gopost@local",
			When:  time.Now(),
		},
	})
	if err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	return nil
}

// Log returns the commit history for a collection.
func Log(collectionDir string) ([]CommitEntry, error) {
	repo, err := git.PlainOpen(collectionDir)
	if err != nil {
		return nil, fmt.Errorf("open repo: %w", err)
	}

	iter, err := repo.Log(&git.LogOptions{})
	if err != nil {
		return nil, fmt.Errorf("log: %w", err)
	}

	var entries []CommitEntry
	iter.ForEach(func(c *object.Commit) error {
		entries = append(entries, CommitEntry{
			Hash:    c.Hash.String()[:7],
			Message: c.Message,
			Author:  c.Author.Name,
			Time:    c.Author.When.Format("Jan 2, 15:04"),
		})
		return nil
	})

	return entries, nil
}

// AddRemote adds a remote to the repository.
func AddRemote(collectionDir, name, url string) error {
	repo, err := git.PlainOpen(collectionDir)
	if err != nil {
		return fmt.Errorf("open repo: %w", err)
	}
	// Remove existing remote with same name
	if r, _ := repo.Remote(name); r != nil {
		repo.DeleteRemote(name)
	}
	_, err = repo.CreateRemote(&config.RemoteConfig{Name: name, URLs: []string{url}})
	return err
}

// Push pushes commits to the named remote.
func Push(collectionDir, remote, branch string) error {
	repo, err := git.PlainOpen(collectionDir)
	if err != nil {
		return fmt.Errorf("open repo: %w", err)
	}
	return repo.Push(&git.PushOptions{RemoteName: remote})
}

// Pull fetches and merges from the named remote.
func Pull(collectionDir, remote string) error {
	repo, err := git.PlainOpen(collectionDir)
	if err != nil {
		return fmt.Errorf("open repo: %w", err)
	}
	wt, err := repo.Worktree()
	if err != nil {
		return fmt.Errorf("worktree: %w", err)
	}
	return wt.Pull(&git.PullOptions{RemoteName: remote})
}
