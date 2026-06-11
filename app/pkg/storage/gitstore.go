package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"gopost/app/pkg/models"
)

// GitStore stores data in a filesystem-native, Git-friendly format.
//
// Directory structure:
//
//	collections/
//	  my-api/
//	    collection.gopost.json       ← CollectionManifest
//	    requests/
//	      get-users.gopost.json      ← RequestFile (one per request)
//	      create-user.gopost.json
//	    environments/
//	      staging.gopost.json        ← Environment
//	environments/
//	  ...gopost.json                  ← Per-environment files
//	history/
//	  history.gopost.json            ← []HistoryEntry (flat, append-only)
//	settings/
//	  preferences.gopost.json        ← User preferences
type GitStore struct {
	mu      sync.RWMutex
	baseDir string
}

// NewGitStore creates a GitStore rooted at baseDir.
func NewGitStore(baseDir string) *GitStore {
	dirs := []string{
		filepath.Join(baseDir, "collections"),
		filepath.Join(baseDir, "environments"),
		filepath.Join(baseDir, "history"),
		filepath.Join(baseDir, "settings"),
	}
	for _, d := range dirs {
		os.MkdirAll(d, 0755)
	}
	return &GitStore{baseDir: baseDir}
}

// ==================== Collections ====================

func (g *GitStore) collectionDir(id string) string {
	return filepath.Join(g.baseDir, "collections", sanitizeName(id))
}
func (g *GitStore) manifestPath(collectionID string) string {
	return filepath.Join(g.collectionDir(collectionID), "collection.gopost.json")
}
func (g *GitStore) requestsDir(collectionID string) string {
	return filepath.Join(g.collectionDir(collectionID), "requests")
}

func (g *GitStore) SaveCollection(c *models.Collection) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if err := os.MkdirAll(g.requestsDir(c.ID), 0755); err != nil {
		return err
	}

	return g.saveCollectionLocked(c)
}

// saveCollectionLocked is the internal version — caller must hold g.mu.
func (g *GitStore) saveCollectionLocked(c *models.Collection) error {
	manifest, _ := g.loadManifest(c.ID)
	if manifest == nil {
		manifest = &models.CollectionManifest{
			Name: c.Name, Schema: 1,
			CreatedAt: c.CreatedAt, UpdatedAt: time.Now(), Order: []string{},
		}
	} else {
		manifest.Name = c.Name
		manifest.UpdatedAt = time.Now()
	}
	return g.saveManifest(c.ID, manifest)
}

func (g *GitStore) GetCollections() ([]models.Collection, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.getCollectionsLocked()
}

func (g *GitStore) getCollectionsLocked() ([]models.Collection, error) {
	entries, err := os.ReadDir(filepath.Join(g.baseDir, "collections"))
	if err != nil {
		if os.IsNotExist(err) {
			return []models.Collection{}, nil
		}
		return nil, err
	}
	var collections []models.Collection
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		manifest, _ := g.loadManifest(entry.Name())
		if manifest == nil {
			manifest = &models.CollectionManifest{
				Name: entry.Name(), Schema: 1, CreatedAt: time.Now(), UpdatedAt: time.Now(),
			}
		}
		collections = append(collections, models.Collection{
			ID: entry.Name(), Name: manifest.Name,
			CreatedAt: manifest.CreatedAt, UpdatedAt: manifest.UpdatedAt,
		})
	}
	sort.Slice(collections, func(i, j int) bool {
		return collections[i].CreatedAt.Before(collections[j].CreatedAt)
	})
	return collections, nil
}

func (g *GitStore) GetCollection(id string) (*models.Collection, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.getCollectionLocked(id)
}

func (g *GitStore) getCollectionLocked(id string) (*models.Collection, error) {
	manifest, err := g.loadManifest(id)
	if err != nil || manifest == nil {
		return nil, fmt.Errorf("collection not found: %s", id)
	}
	return &models.Collection{
		ID: id, Name: manifest.Name,
		CreatedAt: manifest.CreatedAt, UpdatedAt: manifest.UpdatedAt,
	}, nil
}

func (g *GitStore) DeleteCollection(id string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	dir := g.collectionDir(id)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return fmt.Errorf("collection not found: %s", id)
	}
	return os.RemoveAll(dir)
}

// ==================== Requests ====================

func requestFileName(req *models.HTTPRequest) string {
	name := sanitizeName(req.Name)
	if name == "" {
		name = req.ID
	}
	return name + ".gopost.json"
}

func sanitizeName(name string) string {
	r := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "*", "", "?", "", "\"", "", "<", "", ">", "", "|", "")
	return r.Replace(name)
}

func (g *GitStore) SaveRequest(req *models.HTTPRequest) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.saveRequestLocked(req)
}

// saveRequestLocked is the internal version — caller MUST hold g.mu.
func (g *GitStore) saveRequestLocked(req *models.HTTPRequest) error {
	reqDir := g.requestsDir(req.CollectionID)
	if err := os.MkdirAll(reqDir, 0755); err != nil {
		return err
	}

	rf := models.RequestFileFromHTTPRequest(req)
	rf.UpdatedAt = time.Now()
	fileName := requestFileName(req)
	path := filepath.Join(reqDir, fileName)

	// Handle rename: if the request already exists with a different filename,
	// delete the old file and update the manifest.
	existing, _ := g.findRequestFileLocked(req.CollectionID, req.ID)
	if existing != nil {
		oldName := requestFileName(&models.HTTPRequest{Name: existing.Name, ID: existing.ID})
		if oldName != fileName {
			os.Remove(filepath.Join(reqDir, oldName))
			manifest, _ := g.loadManifest(req.CollectionID)
			if manifest != nil {
				for i, n := range manifest.Order {
					if n == oldName {
						manifest.Order[i] = fileName
						break
					}
				}
				g.saveManifest(req.CollectionID, manifest)
			}
		}
	}

	if err := g.writePrettyJSON(path, rf); err != nil {
		return err
	}

	// Add to manifest order
	manifest, _ := g.loadOrCreateManifest(req.CollectionID)
	found := false
	for _, n := range manifest.Order {
		if n == fileName {
			found = true
			break
		}
	}
	if !found {
		manifest.Order = append(manifest.Order, fileName)
		manifest.UpdatedAt = time.Now()
		return g.saveManifest(req.CollectionID, manifest)
	}
	return nil
}

// findRequestFileLocked searches for a request by ID within a collection.
// Caller MUST hold g.mu.
func (g *GitStore) findRequestFileLocked(collectionID, requestID string) (*models.RequestFile, error) {
	reqs, err := g.getRequestsLocked(collectionID)
	if err != nil {
		return nil, err
	}
	for i := range reqs {
		if reqs[i].ID == requestID {
			return models.RequestFileFromHTTPRequest(&reqs[i]), nil
		}
	}
	return nil, fmt.Errorf("request not found")
}

func (g *GitStore) GetRequests(collectionID string) ([]models.HTTPRequest, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.getRequestsLocked(collectionID)
}

// getRequestsLocked reads requests — caller MUST hold g.mu (read or write).
func (g *GitStore) getRequestsLocked(collectionID string) ([]models.HTTPRequest, error) {
	manifest, _ := g.loadManifest(collectionID)
	reqDir := g.requestsDir(collectionID)
	var requests []models.HTTPRequest

	if manifest != nil && len(manifest.Order) > 0 {
		for _, fileName := range manifest.Order {
			path := filepath.Join(reqDir, fileName)
			data, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			var rf models.RequestFile
			if err := json.Unmarshal(data, &rf); err != nil {
				continue
			}
			requests = append(requests, *rf.ToHTTPRequest(collectionID))
		}
	} else {
		entries, err := os.ReadDir(reqDir)
		if err != nil {
			if os.IsNotExist(err) {
				return []models.HTTPRequest{}, nil
			}
			return nil, err
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".gopost.json") {
				continue
			}
			path := filepath.Join(reqDir, entry.Name())
			data, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			var rf models.RequestFile
			if err := json.Unmarshal(data, &rf); err != nil {
				continue
			}
			requests = append(requests, *rf.ToHTTPRequest(collectionID))
		}
	}
	return requests, nil
}

func (g *GitStore) GetRequest(id string) (*models.HTTPRequest, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	cols, err := g.getCollectionsLocked()
	if err != nil {
		return nil, err
	}
	for _, col := range cols {
		reqs, err := g.getRequestsLocked(col.ID)
		if err != nil {
			continue
		}
		for i := range reqs {
			if reqs[i].ID == id {
				return &reqs[i], nil
			}
		}
	}
	return nil, fmt.Errorf("request not found: %s", id)
}

func (g *GitStore) DeleteRequest(id string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	cols, _ := g.getCollectionsLocked()
	for _, col := range cols {
		reqs, _ := g.getRequestsLocked(col.ID)
		for i := range reqs {
			if reqs[i].ID == id {
				return g.deleteRequestFileLocked(col.ID, &reqs[i])
			}
		}
	}
	return fmt.Errorf("request not found: %s", id)
}

// DeleteRequestFromCollection removes a request file from a specific collection.
// Used by MoveRequest when the collection changes to clean up the old file.
func (g *GitStore) DeleteRequestFromCollection(requestID, collectionID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	reqs, _ := g.getRequestsLocked(collectionID)
	for i := range reqs {
		if reqs[i].ID == requestID {
			return g.deleteRequestFileLocked(collectionID, &reqs[i])
		}
	}
	return nil // Not found in this collection — already moved
}

func (g *GitStore) deleteRequestFileLocked(collectionID string, req *models.HTTPRequest) error {
	fileName := requestFileName(req)
	path := filepath.Join(g.requestsDir(collectionID), fileName)
	if err := os.Remove(path); err != nil {
		return err
	}
	manifest, _ := g.loadManifest(collectionID)
	if manifest != nil {
		filtered := make([]string, 0, len(manifest.Order))
		for _, n := range manifest.Order {
			if n != fileName {
				filtered = append(filtered, n)
			}
		}
		manifest.Order = filtered
		manifest.UpdatedAt = time.Now()
		g.saveManifest(collectionID, manifest)
	}
	return nil
}

func (g *GitStore) GetAllRequests() ([]models.HTTPRequest, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	cols, err := g.getCollectionsLocked()
	if err != nil {
		return nil, err
	}
	var all []models.HTTPRequest
	for _, col := range cols {
		reqs, err := g.getRequestsLocked(col.ID)
		if err != nil {
			continue
		}
		all = append(all, reqs...)
	}
	return all, nil
}

// ==================== Environments ====================

func (g *GitStore) SaveEnvironment(env *models.Environment) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	envDir := filepath.Join(g.baseDir, "environments")
	os.MkdirAll(envDir, 0755)
	env.UpdatedAt = time.Now()
	return g.writePrettyJSON(filepath.Join(envDir, sanitizeName(env.ID)+".gopost.json"), env)
}

func (g *GitStore) GetEnvironments() ([]models.Environment, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.getEnvironmentsLocked()
}

func (g *GitStore) getEnvironmentsLocked() ([]models.Environment, error) {
	envDir := filepath.Join(g.baseDir, "environments")
	entries, err := os.ReadDir(envDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []models.Environment{}, nil
		}
		return nil, err
	}
	var envs []models.Environment
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".gopost.json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(envDir, entry.Name()))
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

func (g *GitStore) GetEnvironment(id string) (*models.Environment, error) {
	envs, err := g.GetEnvironments()
	if err != nil {
		return nil, err
	}
	for _, e := range envs {
		if e.ID == id {
			return &e, nil
		}
	}
	return nil, fmt.Errorf("environment not found: %s", id)
}

func (g *GitStore) DeleteEnvironment(id string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	return os.Remove(filepath.Join(g.baseDir, "environments", sanitizeName(id)+".gopost.json"))
}

// ==================== History ====================

func (g *GitStore) historyPath() string {
	return filepath.Join(g.baseDir, "history", "history.gopost.json")
}

func (g *GitStore) SaveHistoryEntry(entry *models.HistoryEntry) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.saveHistoryEntryLocked(entry)
}

func (g *GitStore) saveHistoryEntryLocked(entry *models.HistoryEntry) error {
	history, _ := g.loadHistory()
	history = append([]models.HistoryEntry{*entry}, history...)
	if len(history) > 500 {
		history = history[:500]
	}
	return g.writePrettyJSON(g.historyPath(), history)
}

func (g *GitStore) GetHistory() ([]models.HistoryEntry, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.loadHistory()
}

func (g *GitStore) loadHistory() ([]models.HistoryEntry, error) {
	var history []models.HistoryEntry
	data, err := os.ReadFile(g.historyPath())
	if err != nil {
		if os.IsNotExist(err) {
			return []models.HistoryEntry{}, nil
		}
		return nil, err
	}
	json.Unmarshal(data, &history)
	return history, nil
}

// DeleteHistoryEntriesForCollection removes all history entries that reference
// the given collection ID. Called when a collection is deleted to prevent
// orphaned history entries.
func (g *GitStore) DeleteHistoryEntriesForCollection(collectionID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	history, err := g.loadHistory()
	if err != nil {
		return err
	}

	filtered := make([]models.HistoryEntry, 0, len(history))
	for _, entry := range history {
		if entry.CollectionID != collectionID {
			filtered = append(filtered, entry)
		}
	}

	return g.writePrettyJSON(g.historyPath(), filtered)
}

// ==================== ReplaceAll (for import) ====================

func (g *GitStore) ReplaceAllData(data *models.ExportData) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	colDir := filepath.Join(g.baseDir, "collections")
	os.RemoveAll(colDir)
	os.MkdirAll(colDir, 0755)

	for _, col := range data.Collections {
		g.saveCollectionLocked(&col)
	}
	for _, req := range data.Requests {
		g.saveRequestLocked(&req)
	}

	envDir := filepath.Join(g.baseDir, "environments")
	os.RemoveAll(envDir)
	os.MkdirAll(envDir, 0755)
	for _, env := range data.Environments {
		g.SaveEnvironment(&env)
	}

	os.MkdirAll(filepath.Join(g.baseDir, "history"), 0755)
	return g.writePrettyJSON(g.historyPath(), data.History)
}

// ==================== Manifest Helpers ====================

func (g *GitStore) loadManifest(collectionID string) (*models.CollectionManifest, error) {
	data, err := os.ReadFile(g.manifestPath(collectionID))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var m models.CollectionManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func (g *GitStore) loadOrCreateManifest(collectionID string) (*models.CollectionManifest, error) {
	m, _ := g.loadManifest(collectionID)
	if m == nil {
		m = &models.CollectionManifest{
			Name: collectionID, Schema: 1, CreatedAt: time.Now(), UpdatedAt: time.Now(), Order: []string{},
		}
	}
	return m, nil
}

func (g *GitStore) saveManifest(collectionID string, m *models.CollectionManifest) error {
	os.MkdirAll(g.collectionDir(collectionID), 0755)
	return g.writePrettyJSON(g.manifestPath(collectionID), m)
}

// ==================== User Config ====================

func (g *GitStore) userConfigPath() string {
	return filepath.Join(g.baseDir, "settings", "user-config.gopost.json")
}

// GetUserConfig loads user preferences. Returns defaults if no config exists.
func (g *GitStore) GetUserConfig() (*models.UserConfig, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	data, err := os.ReadFile(g.userConfigPath())
	if err != nil {
		if os.IsNotExist(err) {
			return &models.UserConfig{
				ThemeID:   "github-dark",
				Shortcuts: map[string][]string{},
			}, nil
		}
		return nil, err
	}

	var cfg models.UserConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return &models.UserConfig{
			ThemeID:   "github-dark",
			Shortcuts: map[string][]string{},
		}, nil
	}
	return &cfg, nil
}

// SaveUserConfig persists user preferences.
func (g *GitStore) SaveUserConfig(cfg *models.UserConfig) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.writePrettyJSON(g.userConfigPath(), cfg)
}

// ==================== Collection Runs ====================

func (g *GitStore) runsDir() string {
	return filepath.Join(g.baseDir, "runs")
}

// SaveRunReport saves a collection run result to runs/{collectionID}/{timestamp}.json
func (g *GitStore) SaveRunReport(collectionID string, report map[string]interface{}) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	dir := filepath.Join(g.runsDir(), sanitizeName(collectionID))
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	ts := time.Now().Format("2006-01-02T15-04-05")
	path := filepath.Join(dir, ts+".json")
	return g.writePrettyJSON(path, report)
}

// GetRunHistory returns all saved run reports for a collection, newest first.
func (g *GitStore) GetRunHistory(collectionID string) ([]map[string]interface{}, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	dir := filepath.Join(g.runsDir(), sanitizeName(collectionID))
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []map[string]interface{}{}, nil
		}
		return nil, err
	}

	var results []map[string]interface{}
	for i := len(entries) - 1; i >= 0; i-- {
		entry := entries[i]
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var report map[string]interface{}
		if err := json.Unmarshal(data, &report); err != nil {
			continue
		}
		report["_file"] = entry.Name()
		results = append(results, report)
	}

	return results, nil
}

// ==================== Utilities ====================

func (g *GitStore) writePrettyJSON(path string, v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0644)
}

func (g *GitStore) GetBaseDir() string                { return g.baseDir }
func (g *GitStore) GetCollectionDir(id string) string { return g.collectionDir(id) }
