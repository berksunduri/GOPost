package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

var uuidDirRE = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// AllocateCollectionID returns a unique slug directory name from display name.
func (g *GitStore) AllocateCollectionID(name string) string {
	base := sanitizeName(name)
	if base == "" || base == "unnamed" {
		return uuid.New().String()
	}
	candidate := base
	for i := 0; ; i++ {
		if _, err := os.Stat(g.collectionDir(candidate)); os.IsNotExist(err) {
			return candidate
		}
		suffix := uuid.New().String()
		if len(suffix) > 8 {
			suffix = suffix[:8]
		}
		candidate = base + "--" + suffix
		if i > 20 {
			return uuid.New().String()
		}
	}
}

func environmentFileName(name, id string) string {
	slug := sanitizeName(name)
	if slug == "" || slug == "unnamed" {
		slug = sanitizeName(id)
	}
	return slug + ".gopost.json"
}

// RenameCollectionDir moves collections/oldID → collections/newID and returns newID.
// newID is allocated from newName when empty.
func (g *GitStore) RenameCollectionDir(oldID, newName string) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	oldDir := g.collectionDir(oldID)
	if _, err := os.Stat(oldDir); err != nil {
		return "", fmt.Errorf("collection not found: %s", oldID)
	}

	newID := sanitizeName(newName)
	if newID == "" || newID == "unnamed" {
		newID = oldID
	}
	if newID == oldID {
		return oldID, nil
	}
	newDir := g.collectionDir(newID)
	if _, err := os.Stat(newDir); err == nil {
		// collision — keep old id, only manifest name changes
		return oldID, nil
	}
	if err := os.Rename(oldDir, newDir); err != nil {
		return "", fmt.Errorf("rename collection dir: %w", err)
	}
	return newID, nil
}

// MigrateUUIDCollectionDirs renames UUID collection directories to name slugs when free.
// Returns number of directories renamed.
func (g *GitStore) MigrateUUIDCollectionDirs() (int, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	entries, err := os.ReadDir(filepath.Join(g.baseDir, "collections"))
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	renamed := 0
	for _, entry := range entries {
		if !entry.IsDir() || !uuidDirRE.MatchString(entry.Name()) {
			continue
		}
		oldID := entry.Name()
		manifest, _ := g.loadManifest(oldID)
		if manifest == nil || strings.TrimSpace(manifest.Name) == "" {
			continue
		}
		newID := sanitizeName(manifest.Name)
		if newID == "" || newID == "unnamed" || newID == oldID {
			continue
		}
		newDir := g.collectionDir(newID)
		if _, err := os.Stat(newDir); err == nil {
			continue // collision — leave UUID
		}
		if err := os.Rename(g.collectionDir(oldID), newDir); err != nil {
			return renamed, err
		}
		renamed++
	}
	return renamed, nil
}

// MigrateEnvironmentFilesToSlugs renames UUID-named env files to name slugs.
func (g *GitStore) MigrateEnvironmentFilesToSlugs() (int, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	envDir := filepath.Join(g.baseDir, "environments")
	entries, err := os.ReadDir(envDir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	renamed := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".gopost.json") {
			continue
		}
		stem := strings.TrimSuffix(entry.Name(), ".gopost.json")
		if !uuidDirRE.MatchString(stem) {
			continue
		}
		path := filepath.Join(envDir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var env struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if err := json.Unmarshal(data, &env); err != nil || strings.TrimSpace(env.Name) == "" {
			continue
		}
		newName := environmentFileName(env.Name, env.ID)
		newPath := filepath.Join(envDir, newName)
		if newPath == path {
			continue
		}
		if _, err := os.Stat(newPath); err == nil {
			continue
		}
		if err := os.Rename(path, newPath); err != nil {
			return renamed, err
		}
		renamed++
	}
	return renamed, nil
}

// SanitizeName returns a filesystem-safe path segment.
func SanitizeName(name string) string {
	return sanitizeName(name)
}

// WriteWorkspaceGitignoreForStore writes the workspace .gitignore at the store root.
func (g *GitStore) WriteWorkspaceGitignore() error {
	return WriteWorkspaceGitignore(g.baseDir)
}
