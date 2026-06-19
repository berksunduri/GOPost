//go:build integration

package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gopost/app"
)

func newTestHandler(t *testing.T) (*app.App, http.HandlerFunc) {
	t.Helper()
	a := app.NewApp(t.TempDir())
	return a, func(w http.ResponseWriter, r *http.Request) {
		handleAPI(a, w, r)
	}
}

func doRequest(t *testing.T, handler http.HandlerFunc, method, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body != nil {
		b, _ := json.Marshal(body)
		req = httptest.NewRequest(method, path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	rr := httptest.NewRecorder()
	handler(rr, req)
	return rr
}

func decodeBody(t *testing.T, rr *httptest.ResponseRecorder, dst interface{}) {
	t.Helper()
	if err := json.NewDecoder(rr.Body).Decode(dst); err != nil {
		t.Fatalf("decode response body: %v\nbody: %s", err, rr.Body.String())
	}
}

// ==================== Collections ====================

func TestAPI_GetCollections_Empty(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodGet, "/api/collections", nil)
	if rr.Code != http.StatusOK {
		t.Errorf("status: want 200, got %d", rr.Code)
	}
	var cols []interface{}
	decodeBody(t, rr, &cols)
	if len(cols) != 0 {
		t.Errorf("want [], got %v", cols)
	}
}

func TestAPI_CreateCollection(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/collections", map[string]string{"name": "My API"})
	if rr.Code != http.StatusOK {
		t.Errorf("status: want 200, got %d\nbody: %s", rr.Code, rr.Body.String())
	}
	var col map[string]interface{}
	decodeBody(t, rr, &col)
	if col["name"] != "My API" {
		t.Errorf("name: want 'My API', got %v", col["name"])
	}
	if col["id"] == "" {
		t.Error("id should be set")
	}
}

func TestAPI_UpdateCollection(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/collections", map[string]string{"name": "Old"})
	var col map[string]interface{}
	decodeBody(t, rr, &col)
	id := col["id"].(string)

	rr = doRequest(t, handler, http.MethodPut, "/api/collections/"+id, map[string]string{"name": "New"})
	if rr.Code != http.StatusOK {
		t.Errorf("update status: want 200, got %d\nbody: %s", rr.Code, rr.Body.String())
	}
	var updated map[string]interface{}
	decodeBody(t, rr, &updated)
	if updated["name"] != "New" {
		t.Errorf("name: want 'New', got %v", updated["name"])
	}
}

func TestAPI_DeleteCollection(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/collections", map[string]string{"name": "ToDelete"})
	var col map[string]interface{}
	decodeBody(t, rr, &col)
	id := col["id"].(string)

	rr = doRequest(t, handler, http.MethodDelete, "/api/collections/"+id, nil)
	if rr.Code != http.StatusOK {
		t.Errorf("delete status: want 200, got %d", rr.Code)
	}

	rr = doRequest(t, handler, http.MethodGet, "/api/collections", nil)
	var cols []interface{}
	decodeBody(t, rr, &cols)
	if len(cols) != 0 {
		t.Errorf("want empty list after delete, got %d items", len(cols))
	}
}

// ==================== Requests ====================

func TestAPI_CreateAndGetRequests(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/collections", map[string]string{"name": "API"})
	var col map[string]interface{}
	decodeBody(t, rr, &col)
	colID := col["id"].(string)

	rr = doRequest(t, handler, http.MethodPost, "/api/collections/"+colID+"/requests", map[string]interface{}{
		"name": "List Users", "method": "GET", "url": "https://example.com/users",
	})
	if rr.Code != http.StatusOK {
		t.Errorf("create request: want 200, got %d\nbody: %s", rr.Code, rr.Body.String())
	}

	rr = doRequest(t, handler, http.MethodGet, "/api/collections/"+colID+"/requests", nil)
	var reqs []interface{}
	decodeBody(t, rr, &reqs)
	if len(reqs) != 1 {
		t.Errorf("want 1 request, got %d", len(reqs))
	}
}

func TestAPI_DeleteRequest(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/collections", map[string]string{"name": "API"})
	var col map[string]interface{}
	decodeBody(t, rr, &col)
	colID := col["id"].(string)

	rr = doRequest(t, handler, http.MethodPost, "/api/collections/"+colID+"/requests", map[string]interface{}{
		"name": "ToDelete", "method": "GET", "url": "https://example.com",
	})
	var req map[string]interface{}
	decodeBody(t, rr, &req)
	reqID := req["id"].(string)

	rr = doRequest(t, handler, http.MethodDelete, "/api/requests/"+reqID, nil)
	if rr.Code != http.StatusOK {
		t.Errorf("delete: want 200, got %d", rr.Code)
	}

	rr = doRequest(t, handler, http.MethodGet, "/api/collections/"+colID+"/requests", nil)
	var reqs []interface{}
	decodeBody(t, rr, &reqs)
	if len(reqs) != 0 {
		t.Errorf("want 0 requests after delete, got %d", len(reqs))
	}
}

func TestAPI_SearchRequests(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/collections", map[string]string{"name": "API"})
	var col map[string]interface{}
	decodeBody(t, rr, &col)
	colID := col["id"].(string)

	doRequest(t, handler, http.MethodPost, "/api/collections/"+colID+"/requests", map[string]interface{}{
		"name": "Get Users", "method": "GET", "url": "https://example.com/users",
	})
	doRequest(t, handler, http.MethodPost, "/api/collections/"+colID+"/requests", map[string]interface{}{
		"name": "Get Posts", "method": "GET", "url": "https://example.com/posts",
	})

	rr = doRequest(t, handler, http.MethodGet, "/api/requests/search?q=users", nil)
	if rr.Code != http.StatusOK {
		t.Errorf("search: want 200, got %d", rr.Code)
	}
	var results []interface{}
	decodeBody(t, rr, &results)
	if len(results) != 1 {
		t.Errorf("search 'users': want 1 result, got %d", len(results))
	}
}

// ==================== Environments ====================

func TestAPI_CreateAndGetEnvironments(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/environments", map[string]interface{}{
		"name":      "Staging",
		"variables": map[string]interface{}{"url": "https://staging.example.com"},
	})
	if rr.Code != http.StatusOK {
		t.Errorf("create env: want 200, got %d\nbody: %s", rr.Code, rr.Body.String())
	}

	rr = doRequest(t, handler, http.MethodGet, "/api/environments", nil)
	var envs []interface{}
	decodeBody(t, rr, &envs)
	if len(envs) != 1 {
		t.Errorf("want 1 environment, got %d", len(envs))
	}
}

func TestAPI_DeleteEnvironment(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/environments", map[string]interface{}{
		"name": "ToDelete", "variables": map[string]interface{}{},
	})
	var env map[string]interface{}
	decodeBody(t, rr, &env)
	envID := env["id"].(string)

	rr = doRequest(t, handler, http.MethodDelete, "/api/environments/"+envID, nil)
	if rr.Code != http.StatusOK {
		t.Errorf("delete env: want 200, got %d", rr.Code)
	}

	rr = doRequest(t, handler, http.MethodGet, "/api/environments", nil)
	var envs []interface{}
	decodeBody(t, rr, &envs)
	if len(envs) != 0 {
		t.Errorf("want 0 environments after delete, got %d", len(envs))
	}
}

// ==================== UserConfig ====================

func TestAPI_GetUserConfig_Defaults(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodGet, "/api/user-config", nil)
	if rr.Code != http.StatusOK {
		t.Errorf("status: want 200, got %d", rr.Code)
	}
	var cfg map[string]interface{}
	decodeBody(t, rr, &cfg)
	if cfg["theme_id"] == "" || cfg["theme_id"] == nil {
		t.Errorf("default theme_id should not be empty, got %v", cfg["theme_id"])
	}
}

func TestAPI_SaveUserConfig(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPut, "/api/user-config", map[string]interface{}{
		"theme_id":  "solarized-light",
		"shortcuts": map[string]interface{}{},
	})
	if rr.Code != http.StatusOK {
		t.Errorf("status: want 200, got %d\nbody: %s", rr.Code, rr.Body.String())
	}
	var cfg map[string]interface{}
	decodeBody(t, rr, &cfg)
	if cfg["theme_id"] != "solarized-light" {
		t.Errorf("saved theme_id: want 'solarized-light', got %v", cfg["theme_id"])
	}
}

// ==================== Import / Export (preview mode) ====================

func TestAPI_ImportContent_Preview(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/import-content", map[string]interface{}{
		"mode": "preview",
		"data": map[string]interface{}{
			"version":      1,
			"collections":  []interface{}{map[string]interface{}{"id": "c1", "name": "Imported"}},
			"requests":     []interface{}{},
			"environments": []interface{}{},
			"history":      []interface{}{},
		},
	})
	if rr.Code != http.StatusOK {
		t.Errorf("preview: want 200, got %d\nbody: %s", rr.Code, rr.Body.String())
	}
	var result map[string]interface{}
	decodeBody(t, rr, &result)
	if result["collections"].(float64) != 1 {
		t.Errorf("preview collections count: want 1, got %v", result["collections"])
	}
}

func TestAPI_ImportContent_InvalidMode(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodPost, "/api/import-content", map[string]interface{}{
		"mode": "explode",
		"data": map[string]interface{}{},
	})
	if rr.Code != http.StatusBadRequest {
		t.Errorf("invalid mode: want 400, got %d", rr.Code)
	}
}

// ==================== Storage info ====================

func TestAPI_GetStorageInfo(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodGet, "/api/storage-info", nil)
	if rr.Code != http.StatusOK {
		t.Errorf("storage-info: want 200, got %d", rr.Code)
	}
}

// ==================== 404 for unknown routes ====================

func TestAPI_UnknownRoute_Returns404(t *testing.T) {
	_, handler := newTestHandler(t)
	rr := doRequest(t, handler, http.MethodGet, "/api/not-a-real-endpoint", nil)
	if rr.Code != http.StatusNotFound {
		t.Errorf("unknown route: want 404, got %d", rr.Code)
	}
}
