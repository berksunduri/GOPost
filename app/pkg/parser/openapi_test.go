package parser

import (
	"encoding/json"
	"strings"
	"testing"
)

// openAPI3Spec is a minimal valid OpenAPI 3.x JSON spec.
const openAPI3Spec = `{
  "openapi": "3.0.3",
  "info": {
    "title": "Petstore API",
    "version": "1.0.0"
  },
  "servers": [
    { "url": "https://petstore.example.com/v2" }
  ],
  "paths": {
    "/pets": {
      "get": {
        "summary": "List all pets",
        "operationId": "listPets",
        "parameters": [
          { "name": "limit", "in": "query", "schema": { "type": "integer" } }
        ]
      },
      "post": {
        "summary": "Create a pet",
        "operationId": "createPet",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": { "type": "object" }
            }
          }
        }
      }
    },
    "/pets/{petId}": {
      "get": {
        "summary": "Get a pet by ID",
        "operationId": "getPetById",
        "parameters": [
          { "name": "petId", "in": "path", "required": true, "schema": { "type": "string" } }
        ]
      }
    }
  }
}`

// swagger20Spec is a minimal valid Swagger 2.0 JSON spec.
const swagger20Spec = `{
  "swagger": "2.0",
  "info": {
    "title": "Simple API",
    "version": "1.0.0"
  },
  "host": "api.example.com",
  "basePath": "/v1",
  "schemes": ["https"],
  "paths": {
    "/users": {
      "get": {
        "summary": "List users",
        "operationId": "listUsers",
        "parameters": [
          { "name": "Authorization", "in": "header", "type": "string", "default": "Bearer token123" }
        ]
      }
    }
  }
}`

// openAPI3NoServers is a spec without explicit server info.
const openAPI3NoServers = `{
  "openapi": "3.0.0",
  "info": { "title": "Local API", "version": "1.0.0" },
  "paths": {
    "/health": {
      "get": {
        "summary": "Health check"
      }
    }
  }
}`

func TestParseOpenAPISpec_3x(t *testing.T) {
	spec, err := ParseOpenAPISpec([]byte(openAPI3Spec))
	if err != nil {
		t.Fatalf("ParseOpenAPISpec failed: %v", err)
	}

	if spec.OpenAPI != "3.0.3" {
		t.Errorf("expected openapi '3.0.3', got %q", spec.OpenAPI)
	}
	if spec.Info.Title != "Petstore API" {
		t.Errorf("expected title 'Petstore API', got %q", spec.Info.Title)
	}
	if len(spec.Paths) != 2 {
		t.Errorf("expected 2 paths, got %d", len(spec.Paths))
	}
}

func TestParseOpenAPISpec_Swagger2(t *testing.T) {
	spec, err := ParseOpenAPISpec([]byte(swagger20Spec))
	if err != nil {
		t.Fatalf("ParseOpenAPISpec failed: %v", err)
	}

	if spec.Swagger != "2.0" {
		t.Errorf("expected swagger '2.0', got %q", spec.Swagger)
	}
	if spec.Host != "api.example.com" {
		t.Errorf("expected host 'api.example.com', got %q", spec.Host)
	}
}

func TestParseOpenAPISpec_InvalidJSON(t *testing.T) {
	_, err := ParseOpenAPISpec([]byte("not json"))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestParseOpenAPISpec_NoVersionKey(t *testing.T) {
	_, err := ParseOpenAPISpec([]byte(`{"info": {"title": "test"}}`))
	if err == nil {
		t.Error("expected error for missing openapi/swagger key")
	}
	if !strings.Contains(err.Error(), "missing 'openapi' or 'swagger'") {
		t.Errorf("expected missing key error, got: %v", err)
	}
}

func TestParseOpenAPISpec_NoPaths(t *testing.T) {
	_, err := ParseOpenAPISpec([]byte(`{"openapi": "3.0.0", "info": {"title": "test"}}`))
	if err == nil {
		t.Error("expected error for missing paths")
	}
}

func TestExtractOperations_3x(t *testing.T) {
	spec, err := ParseOpenAPISpec([]byte(openAPI3Spec))
	if err != nil {
		t.Fatalf("ParseOpenAPISpec failed: %v", err)
	}

	ops := ExtractOperations(spec)
	if len(ops) != 3 {
		t.Fatalf("expected 3 operations, got %d", len(ops))
	}

	// Map iteration is non-deterministic; find by name
	byName := make(map[string]ImportedRequest)
	for _, op := range ops {
		byName[op.Name] = op
	}

	// GET /pets — listPets
	listPets, ok := byName["listPets"]
	if !ok {
		t.Fatal("missing operation 'listPets'")
	}
	if listPets.Method != "GET" {
		t.Errorf("expected GET, got %s", listPets.Method)
	}
	if listPets.URL != "https://petstore.example.com/v2/pets" {
		t.Errorf("expected URL 'https://petstore.example.com/v2/pets', got %q", listPets.URL)
	}

	// POST /pets — createPet
	createPet, ok := byName["createPet"]
	if !ok {
		t.Fatal("missing operation 'createPet'")
	}
	if createPet.Method != "POST" {
		t.Errorf("expected POST, got %s", createPet.Method)
	}
	if createPet.Body != "{}" {
		t.Errorf("expected body '{}', got %q", createPet.Body)
	}

	// GET /pets/{petId} — getPetById
	_, ok = byName["getPetById"]
	if !ok {
		t.Fatal("missing operation 'getPetById'")
	}
}

func TestExtractOperations_Swagger2(t *testing.T) {
	spec, err := ParseOpenAPISpec([]byte(swagger20Spec))
	if err != nil {
		t.Fatalf("ParseOpenAPISpec failed: %v", err)
	}

	ops := ExtractOperations(spec)
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}

	// Swagger 2.0 URL: schemes[0]://host + basePath + path
	if ops[0].URL != "https://api.example.com/v1/users" {
		t.Errorf("expected URL 'https://api.example.com/v1/users', got %q", ops[0].URL)
	}

	// Name should use operationId (which takes precedence over summary)
	if ops[0].Name != "listUsers" {
		t.Errorf("expected name 'listUsers', got %q", ops[0].Name)
	}

	// Header extraction from parameter with "default" value
	if ops[0].Headers["Authorization"] != "Bearer token123" {
		t.Errorf("expected Authorization header 'Bearer token123', got %q", ops[0].Headers["Authorization"])
	}
}

func TestExtractOperations_NoServers(t *testing.T) {
	spec, err := ParseOpenAPISpec([]byte(openAPI3NoServers))
	if err != nil {
		t.Fatalf("ParseOpenAPISpec failed: %v", err)
	}

	ops := ExtractOperations(spec)
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}

	if ops[0].URL != "/health" {
		t.Errorf("expected URL '/health', got %q", ops[0].URL)
	}
	if ops[0].Method != "GET" {
		t.Errorf("expected GET, got %s", ops[0].Method)
	}
}

func TestExtractOperations_FallbackName(t *testing.T) {
	spec := &OpenAPISpec{
		OpenAPI: "3.0.0",
		Info:    OpenAPIInfo{Title: "Test"},
		Paths: map[string]map[string]json.RawMessage{
			"/items": {
				"delete": json.RawMessage(`{}`),
			},
		},
	}

	ops := ExtractOperations(spec)
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation, got %d", len(ops))
	}

	if ops[0].Name != "DELETE /items" {
		t.Errorf("expected fallback name 'DELETE /items', got %q", ops[0].Name)
	}
}

func TestExtractOperations_SkipsNonHTTPKeys(t *testing.T) {
	raw := `{
  "openapi": "3.0.0",
  "info": { "title": "Test" },
  "paths": {
    "/data": {
      "get": { "summary": "Get data" },
      "parameters": [
        { "name": "X-Trace-Id", "in": "header", "schema": { "type": "string", "example": "abc123" } }
      ]
    }
  }
}`
	spec, err := ParseOpenAPISpec([]byte(raw))
	if err != nil {
		t.Fatalf("ParseOpenAPISpec failed: %v", err)
	}

	ops := ExtractOperations(spec)
	if len(ops) != 1 {
		t.Fatalf("expected 1 operation (parameters key skipped), got %d", len(ops))
	}

	// Path-level header parameter should be applied
	if ops[0].Headers["X-Trace-Id"] != "abc123" {
		t.Errorf("expected path-level header X-Trace-Id, got %q", ops[0].Headers["X-Trace-Id"])
	}
}

func TestExtractOperations_EmptySpec(t *testing.T) {
	spec := &OpenAPISpec{
		OpenAPI: "3.0.0",
		Info:    OpenAPIInfo{Title: "Empty"},
		Paths:   map[string]map[string]json.RawMessage{},
	}

	ops := ExtractOperations(spec)
	if len(ops) != 0 {
		t.Errorf("expected 0 operations for empty spec, got %d", len(ops))
	}
}

func TestExtractOperations_RelativeServerURL(t *testing.T) {
	// Server URL is relative (e.g., "/api") — should not be used as base.
	// Paths should remain as-is so the user can set a base URL via environments.
	raw := `{
  "openapi": "3.0.1",
  "info": { "title": "Test" },
  "servers": [{ "url": "/api" }],
  "paths": {
    "/AddProductImages": {
      "post": { "summary": "Add images" }
    },
    "/api/Administrator/GetProducts": {
      "post": { "summary": "Get products" }
    }
  }
}`
	spec, err := ParseOpenAPISpec([]byte(raw))
	if err != nil {
		t.Fatalf("ParseOpenAPISpec failed: %v", err)
	}

	ops := ExtractOperations(spec)
	if len(ops) != 2 {
		t.Fatalf("expected 2 operations, got %d", len(ops))
	}

	byName := make(map[string]ImportedRequest)
	for _, op := range ops {
		byName[op.Name] = op
	}

	// Relative server URL should be ignored — paths stay as-is
	addImages := byName["Add images"]
	if addImages.URL != "/AddProductImages" {
		t.Errorf("expected '/AddProductImages', got %q", addImages.URL)
	}

	getProducts := byName["Get products"]
	if getProducts.URL != "/api/Administrator/GetProducts" {
		t.Errorf("expected '/api/Administrator/GetProducts', got %q", getProducts.URL)
	}
}

func TestResolveBaseURL(t *testing.T) {
	// OpenAPI 3.x
	spec3 := &OpenAPISpec{
		Servers: []OpenAPIServer{{URL: "https://api.example.com/v1/"}},
	}
	if got := resolveBaseURL(spec3); got != "https://api.example.com/v1" {
		t.Errorf("expected 'https://api.example.com/v1', got %q", got)
	}

	// Swagger 2.0
	spec2 := &OpenAPISpec{
		Host:     "api.example.com",
		BasePath: "/v2",
		Schemes:  []string{"http"},
	}
	if got := resolveBaseURL(spec2); got != "http://api.example.com/v2" {
		t.Errorf("expected 'http://api.example.com/v2', got %q", got)
	}

	// Swagger 2.0 with default scheme (https)
	spec2Default := &OpenAPISpec{
		Host:     "api.example.com",
		BasePath: "/v1",
	}
	if got := resolveBaseURL(spec2Default); got != "https://api.example.com/v1" {
		t.Errorf("expected 'https://api.example.com/v1', got %q", got)
	}

	// No server info
	specNone := &OpenAPISpec{}
	if got := resolveBaseURL(specNone); got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}
