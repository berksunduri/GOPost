package storage

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"gopost/app/pkg/models"
)

// MigrateFromLegacy detects legacy monolithic JSON files in baseDir
// and migrates them to the GitStore directory-per-file format.
// Old files are renamed to .legacy.bak after successful migration.
func MigrateFromLegacy(baseDir string) (bool, error) {
	legacy := New(baseDir)
	git, err := NewGitStore(baseDir)
	if err != nil {
		return false, fmt.Errorf("migration: failed to create GitStore: %w", err)
	}

	colPath := filepath.Join(baseDir, "collections.json")
	if _, err := os.Stat(colPath); os.IsNotExist(err) {
		return false, nil
	}

	// Check if GitStore already has data
	git.mu.RLock()
	existingCols, _ := git.getCollectionsLocked()
	git.mu.RUnlock()
	if len(existingCols) > 0 {
		log.Println("[migration] GitStore already populated, skipping.")
		return false, nil
	}

	log.Println("[migration] Legacy data detected. Migrating to Git-friendly format...")

	legacyCols, err := legacy.GetCollections()
	if err != nil {
		return false, fmt.Errorf("loading legacy collections: %w", err)
	}
	legacyReqs, err := legacy.GetAllRequests()
	if err != nil {
		return false, fmt.Errorf("loading legacy requests: %w", err)
	}
	legacyEnvs, err := legacy.GetEnvironments()
	if err != nil {
		return false, fmt.Errorf("loading legacy environments: %w", err)
	}
	legacyHistory, err := legacy.GetHistory()
	if err != nil {
		return false, fmt.Errorf("loading legacy history: %w", err)
	}

	// Acquire write lock once for the entire migration
	git.mu.Lock()
	defer git.mu.Unlock()

	for _, col := range legacyCols {
		if err := git.saveCollectionLocked(&col); err != nil {
			return false, fmt.Errorf("migrating collection %s: %w", col.Name, err)
		}
		log.Printf("[migration]   ✓ collection: %s", col.Name)
	}

	for _, req := range legacyReqs {
		if err := git.saveRequestLocked(&req); err != nil {
			return false, fmt.Errorf("migrating request %s: %w", req.Name, err)
		}
	}
	log.Printf("[migration]   ✓ %d requests", len(legacyReqs))

	envDir := filepath.Join(baseDir, "environments")
	os.MkdirAll(envDir, 0700)
	for _, env := range legacyEnvs {
		env.UpdatedAt = env.CreatedAt
		git.writePrettyJSON(filepath.Join(envDir, sanitizeName(env.ID)+".gopost.json"), env)
	}
	log.Printf("[migration]   ✓ %d environments", len(legacyEnvs))

	for _, entry := range legacyHistory {
		git.saveHistoryEntryLocked(&entry)
	}
	log.Printf("[migration]   ✓ %d history entries", len(legacyHistory))

	// Rename legacy files to .bak
	for _, f := range []string{"collections.json", "requests.json", "environments.json", "history.json"} {
		oldPath := filepath.Join(baseDir, f)
		newPath := oldPath + ".legacy.bak"
		if _, err := os.Stat(oldPath); err == nil {
			os.Rename(oldPath, newPath)
		}
	}

	log.Println("[migration] Complete. Old files → .legacy.bak (safe to delete).")
	return true, nil
}

// ExportToGitStore exports an ExportData snapshot directly to GitStore format.
func ExportToGitStore(baseDir string, data *models.ExportData) error {
	git, err := NewGitStore(baseDir)
	if err != nil {
		return err
	}
	return git.ReplaceAllData(data)
}
