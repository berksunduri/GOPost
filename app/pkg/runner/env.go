package runner

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopost/app/pkg/models"
	"gopost/app/pkg/storage"
)

// ResolveDataDir returns the workspace root for CLI/runner use.
// Order: explicit → GOPOST_DATA_DIR → saved pointer → ~/.gopost.
func ResolveDataDir(explicit string) (string, error) {
	return storage.ResolveWorkspaceDir(explicit)
}

// LoadEnvironmentByName finds an environment under dataDir/environments by name or ID.
func LoadEnvironmentByName(dataDir, name string) (*models.Environment, error) {
	if name == "" {
		return nil, fmt.Errorf("environment name is empty")
	}
	envs, err := listEnvironments(dataDir)
	if err != nil {
		return nil, err
	}
	for i := range envs {
		if envs[i].Name == name || envs[i].ID == name {
			return &envs[i], nil
		}
	}
	return nil, fmt.Errorf("environment %q not found under %s", name, filepath.Join(dataDir, "environments"))
}

// LoadEnvironmentFile reads a single environment JSON / .gopost.json file.
func LoadEnvironmentFile(path string) (*models.Environment, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read env file: %w", err)
	}
	var env models.Environment
	if err := json.Unmarshal(data, &env); err != nil {
		return nil, fmt.Errorf("parse env file: %w", err)
	}
	return &env, nil
}

func listEnvironments(dataDir string) ([]models.Environment, error) {
	envDir := filepath.Join(dataDir, "environments")
	entries, err := os.ReadDir(envDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("environments directory not found: %s", envDir)
		}
		return nil, err
	}
	var envs []models.Environment
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".gopost.json") && !strings.HasSuffix(name, ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(envDir, name))
		if err != nil {
			continue
		}
		var env models.Environment
		if err := json.Unmarshal(data, &env); err != nil {
			continue
		}
		envs = append(envs, env)
	}
	return envs, nil
}
