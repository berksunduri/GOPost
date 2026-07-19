package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	envDataDir       = "GOPOST_DATA_DIR"
	workspaceFile    = "workspace.gopost.json"
	defaultDataDirName = ".gopost"
)

// workspacePointer is stored under the global ~/.gopost settings dir so the
// active workspace can live elsewhere without a chicken-egg prefs lookup.
type workspacePointer struct {
	Path string `json:"path"`
}

// GlobalAppDataDir returns ~/.gopost (always the global app data root).
func GlobalAppDataDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, defaultDataDirName), nil
}

func workspacePointerPath() (string, error) {
	root, err := GlobalAppDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, "settings", workspaceFile), nil
}

// LoadWorkspacePointer returns the saved workspace path, or "" if unset.
func LoadWorkspacePointer() (string, error) {
	path, err := workspacePointerPath()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	var p workspacePointer
	if err := json.Unmarshal(data, &p); err != nil {
		return "", nil // ponytail: corrupt pointer → treat as unset
	}
	return strings.TrimSpace(p.Path), nil
}

// SaveWorkspacePointer persists the last opened workspace under ~/.gopost.
func SaveWorkspacePointer(dir string) error {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return fmt.Errorf("resolve workspace path: %w", err)
	}
	pointerPath, err := workspacePointerPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(pointerPath), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(workspacePointer{Path: abs}, "", "  ")
	if err != nil {
		return err
	}
	tmp := pointerPath + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0600); err != nil {
		return err
	}
	return os.Rename(tmp, pointerPath)
}

// ResolveWorkspaceDir picks the workspace root.
// Order: explicit → GOPOST_DATA_DIR → saved pointer → ~/.gopost.
func ResolveWorkspaceDir(explicit string) (string, error) {
	if strings.TrimSpace(explicit) != "" {
		return filepath.Abs(explicit)
	}
	if v := strings.TrimSpace(os.Getenv(envDataDir)); v != "" {
		return filepath.Abs(v)
	}
	if saved, err := LoadWorkspacePointer(); err == nil && saved != "" {
		return filepath.Abs(saved)
	}
	return GlobalAppDataDir()
}

// ValidateWorkspaceDir ensures dir exists (or can be created) and is absolute.
func ValidateWorkspaceDir(dir string) (string, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", fmt.Errorf("resolve path: %w", err)
	}
	if abs == "" || abs == string(filepath.Separator) {
		return "", fmt.Errorf("invalid workspace path")
	}
	if err := os.MkdirAll(abs, 0700); err != nil {
		return "", fmt.Errorf("create workspace: %w", err)
	}
	info, err := os.Stat(abs)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("not a directory: %s", abs)
	}
	return abs, nil
}

// WriteWorkspaceGitignore writes a root .gitignore for history/runs/settings noise.
// Does not overwrite an existing file.
func WriteWorkspaceGitignore(baseDir string) error {
	path := filepath.Join(baseDir, ".gitignore")
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	const content = `# GoPost workspace — keep collections/ and environments/ tracked.
# Do not commit secrets: scrub auth tokens and secret env vars before push.
history/
runs/
settings/
*.log
.DS_Store
`
	return os.WriteFile(path, []byte(content), 0600)
}
