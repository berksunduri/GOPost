package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopost/app/pkg/models"
)

// Storage handles all data persistence
type Storage struct {
	mu      sync.RWMutex
	dataDir string
}

// New creates a new storage instance
func New(dataDir string) *Storage {
	// Ensure data directory exists
	os.MkdirAll(dataDir, 0755)
	return &Storage{dataDir: dataDir}
}

// Collections
func (s *Storage) SaveCollection(c *models.Collection) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	collections, err := s.loadCollections()
	if err != nil {
		collections = []models.Collection{}
	}

	// Check if collection exists, update or add
	found := false
	for i, col := range collections {
		if col.ID == c.ID {
			collections[i] = *c
			found = true
			break
		}
	}
	if !found {
		collections = append(collections, *c)
	}

	return s.saveJSON("collections.json", collections)
}

func (s *Storage) GetCollections() ([]models.Collection, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.loadCollections()
}

func (s *Storage) GetCollection(id string) (*models.Collection, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	collections, err := s.loadCollections()
	if err != nil {
		return nil, err
	}

	for _, c := range collections {
		if c.ID == id {
			return &c, nil
		}
	}
	return nil, fmt.Errorf("collection not found")
}

func (s *Storage) DeleteCollection(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	collections, err := s.loadCollections()
	if err != nil {
		return err
	}

	for i, col := range collections {
		if col.ID == id {
			collections = append(collections[:i], collections[i+1:]...)
			break
		}
	}

	requests, err := s.loadRequests()
	if err != nil {
		return err
	}
	filteredRequests := make([]models.HTTPRequest, 0, len(requests))
	for _, request := range requests {
		if request.CollectionID != id {
			filteredRequests = append(filteredRequests, request)
		}
	}

	if err := s.saveJSON("collections.json", collections); err != nil {
		return err
	}
	return s.saveJSON("requests.json", filteredRequests)
}

// Requests
func (s *Storage) SaveRequest(req *models.HTTPRequest) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	requests, err := s.loadRequests()
	if err != nil {
		requests = []models.HTTPRequest{}
	}

	found := false
	for i, r := range requests {
		if r.ID == req.ID {
			requests[i] = *req
			found = true
			break
		}
	}
	if !found {
		requests = append(requests, *req)
	}

	return s.saveJSON("requests.json", requests)
}

func (s *Storage) GetRequests(collectionID string) ([]models.HTTPRequest, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	requests, err := s.loadRequests()
	if err != nil {
		return nil, err
	}

	var filtered []models.HTTPRequest
	for _, r := range requests {
		if r.CollectionID == collectionID {
			filtered = append(filtered, r)
		}
	}
	return filtered, nil
}

func (s *Storage) GetRequest(id string) (*models.HTTPRequest, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	requests, err := s.loadRequests()
	if err != nil {
		return nil, err
	}

	for _, r := range requests {
		if r.ID == id {
			return &r, nil
		}
	}
	return nil, fmt.Errorf("request not found")
}

func (s *Storage) DeleteRequest(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	requests, err := s.loadRequests()
	if err != nil {
		return err
	}

	for i, r := range requests {
		if r.ID == id {
			requests = append(requests[:i], requests[i+1:]...)
			break
		}
	}

	return s.saveJSON("requests.json", requests)
}

func (s *Storage) GetAllRequests() ([]models.HTTPRequest, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.loadRequests()
}

// Environments
func (s *Storage) SaveEnvironment(env *models.Environment) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	environments, err := s.loadEnvironments()
	if err != nil {
		environments = []models.Environment{}
	}

	found := false
	for i, e := range environments {
		if e.ID == env.ID {
			environments[i] = *env
			found = true
			break
		}
	}
	if !found {
		environments = append(environments, *env)
	}

	return s.saveJSON("environments.json", environments)
}

func (s *Storage) GetEnvironments() ([]models.Environment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.loadEnvironments()
}

func (s *Storage) GetEnvironment(id string) (*models.Environment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	environments, err := s.loadEnvironments()
	if err != nil {
		return nil, err
	}

	for _, e := range environments {
		if e.ID == id {
			return &e, nil
		}
	}
	return nil, fmt.Errorf("environment not found")
}

func (s *Storage) DeleteEnvironment(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	environments, err := s.loadEnvironments()
	if err != nil {
		return err
	}

	for i, e := range environments {
		if e.ID == id {
			environments = append(environments[:i], environments[i+1:]...)
			break
		}
	}

	return s.saveJSON("environments.json", environments)
}

// History
func (s *Storage) SaveHistoryEntry(entry *models.HistoryEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	history, err := s.loadHistory()
	if err != nil {
		history = []models.HistoryEntry{}
	}
	history = append([]models.HistoryEntry{*entry}, history...)
	if len(history) > 500 {
		history = history[:500]
	}
	return s.saveJSON("history.json", history)
}

func (s *Storage) GetHistory() ([]models.HistoryEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.loadHistory()
}

func (s *Storage) ReplaceAllData(data *models.ExportData) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.saveJSON("collections.json", data.Collections); err != nil {
		return err
	}
	if err := s.saveJSON("requests.json", data.Requests); err != nil {
		return err
	}
	if err := s.saveJSON("environments.json", data.Environments); err != nil {
		return err
	}
	return s.saveJSON("history.json", data.History)
}

// Helper functions
func (s *Storage) loadCollections() ([]models.Collection, error) {
	var collections []models.Collection
	err := s.loadJSON("collections.json", &collections)
	return collections, err
}

func (s *Storage) loadRequests() ([]models.HTTPRequest, error) {
	var requests []models.HTTPRequest
	err := s.loadJSON("requests.json", &requests)
	return requests, err
}

func (s *Storage) loadEnvironments() ([]models.Environment, error) {
	var environments []models.Environment
	err := s.loadJSON("environments.json", &environments)
	return environments, err
}

func (s *Storage) loadHistory() ([]models.HistoryEntry, error) {
	var history []models.HistoryEntry
	err := s.loadJSON("history.json", &history)
	return history, err
}

func (s *Storage) loadJSON(filename string, v interface{}) error {
	path := filepath.Join(s.dataDir, filename)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // Return empty data if file doesn't exist yet
		}
		return err
	}
	return json.Unmarshal(data, v)
}

func (s *Storage) saveJSON(filename string, v interface{}) error {
	path := filepath.Join(s.dataDir, filename)
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}
