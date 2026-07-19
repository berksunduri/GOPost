package runner

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gopost/app/pkg/models"
)

func TestLoadRequests_AmbiguousName(t *testing.T) {
	dataDir := t.TempDir()
	writeTestCollection(t, dataDir, "a", "Same", []models.RequestFile{
		{ID: "1", Name: "r", Method: "GET", URL: "http://x"},
	})
	writeTestCollection(t, dataDir, "b", "Same", []models.RequestFile{
		{ID: "2", Name: "r2", Method: "GET", URL: "http://y"},
	})
	_, _, err := loadRequests("Same", dataDir)
	if err == nil {
		t.Fatal("expected ambiguous error")
	}
}

func TestLoadEnvironmentByName_Missing(t *testing.T) {
	_, err := LoadEnvironmentByName(t.TempDir(), "nope")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestExecuteOne_TestScript(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	exec := &HTTPExecutor{Client: srv.Client()}
	req := models.HTTPRequest{
		Name:       "t",
		Method:     "GET",
		URL:        srv.URL,
		TestScript: `assert.status(expected=200)`,
	}
	rr := executeOne(req, Config{Timeout: time.Second}, exec)
	if !rr.Passed {
		t.Fatalf("failed: %+v", rr)
	}
}

func TestExecuteOne_PreRequestFail(t *testing.T) {
	exec := &HTTPExecutor{Client: http.DefaultClient}
	req := models.HTTPRequest{
		Name:             "t",
		Method:           "GET",
		URL:              "http://example.com",
		PreRequestScript: `assert.ok(condition=False)`,
	}
	rr := executeOne(req, Config{}, exec)
	if rr.Passed {
		t.Fatal("expected fail")
	}
}

func TestLoadEnvironmentFile_BadJSON(t *testing.T) {
	p := filepath.Join(t.TempDir(), "bad.json")
	_ = os.WriteFile(p, []byte("{"), 0600)
	_, err := LoadEnvironmentFile(p)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestListEnvironments_LegacyJSON(t *testing.T) {
	dataDir := t.TempDir()
	envDir := filepath.Join(dataDir, "environments")
	_ = os.MkdirAll(envDir, 0700)
	env := models.Environment{ID: "1", Name: "legacy", Variables: map[string]interface{}{"x": "1"}}
	data, _ := json.Marshal(env)
	_ = os.WriteFile(filepath.Join(envDir, "legacy.json"), data, 0600)
	got, err := LoadEnvironmentByName(dataDir, "legacy")
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "legacy" {
		t.Fatalf("%q", got.Name)
	}
}
