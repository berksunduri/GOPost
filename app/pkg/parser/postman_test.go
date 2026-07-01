package parser

import (
	"strings"
	"testing"
)

// postmanCollectionV21 is a minimal valid Postman Collection v2.1 JSON export.
const postmanCollectionV21 = `{
  "info": {
    "name": "Test API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Users",
      "request": {
        "method": "GET",
        "url": {
          "raw": "https://api.example.com/users",
          "host": ["api", "example", "com"],
          "path": ["users"]
        },
        "header": [
          { "key": "Authorization", "value": "Bearer {{token}}" },
          { "key": "Accept", "value": "application/json" }
        ]
      }
    },
    {
      "name": "Auth",
      "item": [
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "url": {
              "raw": "https://api.example.com/auth/login",
              "host": ["api", "example", "com"],
              "path": ["auth", "login"]
            },
            "header": [
              { "key": "Content-Type", "value": "application/json" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\"username\": \"admin\", \"password\": \"secret\"}"
            }
          }
        }
      ]
    }
  ]
}`

const postmanEnvJSON = `{
  "name": "Production",
  "values": [
    { "key": "base_url", "value": "https://api.example.com", "enabled": true },
    { "key": "token", "value": "secret123", "enabled": true },
    { "key": "disabled_var", "value": "ignored", "enabled": false }
  ]
}`

func TestParsePostmanCollection(t *testing.T) {
	coll, err := ParsePostmanCollection([]byte(postmanCollectionV21))
	if err != nil {
		t.Fatalf("ParsePostmanCollection failed: %v", err)
	}

	if coll.Info.Name != "Test API" {
		t.Errorf("expected name 'Test API', got %q", coll.Info.Name)
	}
	if len(coll.Item) != 2 {
		t.Errorf("expected 2 top-level items, got %d", len(coll.Item))
	}
}

func TestFlattenRequests(t *testing.T) {
	requests := FlattenRequests(&PostmanCollection{
		Info: PostmanInfo{Name: "Test", Schema: "v2.1"},
		Item: []PostmanItem{
			{
				Name: "Get Users",
				Request: &PostmanRequest{
					Method: "GET",
					URL:    &PostmanURL{Raw: "https://api.example.com/users"},
				},
			},
			{
				Name: "Folder A",
				Item: []PostmanItem{
					{
						Name: "Nested Request",
						Request: &PostmanRequest{
							Method: "POST",
							URL:    &PostmanURL{Raw: "https://api.example.com/data"},
						},
					},
				},
			},
		},
	})

	if len(requests) != 2 {
		t.Fatalf("expected 2 flattened requests, got %d", len(requests))
	}

	if requests[0].Name != "Get Users" {
		t.Errorf("expected first request 'Get Users', got %q", requests[0].Name)
	}
	if requests[0].Method != "GET" {
		t.Errorf("expected GET method, got %q", requests[0].Method)
	}

	if requests[1].Name != "Nested Request" {
		t.Errorf("expected second request 'Nested Request', got %q", requests[1].Name)
	}
	if requests[1].FolderPath != "Folder A" {
		t.Errorf("expected FolderPath 'Folder A', got %q", requests[1].FolderPath)
	}
}

func TestParsePostmanCollection_InvalidJSON(t *testing.T) {
	_, err := ParsePostmanCollection([]byte("not json"))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestParsePostmanCollection_NoSchema(t *testing.T) {
	_, err := ParsePostmanCollection([]byte(`{"info": {"name": "no schema"}}`))
	if err == nil {
		t.Error("expected error for missing schema")
	}
	if !strings.Contains(err.Error(), "missing info.schema") {
		t.Errorf("expected 'missing info.schema' error, got: %v", err)
	}
}

func TestParsePostmanEnvironment(t *testing.T) {
	env, err := ParsePostmanEnvironment([]byte(postmanEnvJSON))
	if err != nil {
		t.Fatalf("ParsePostmanEnvironment failed: %v", err)
	}

	if env.Name != "Production" {
		t.Errorf("expected name 'Production', got %q", env.Name)
	}
	if len(env.Values) != 3 {
		t.Errorf("expected 3 values, got %d", len(env.Values))
	}

	enabledCount := 0
	for _, v := range env.Values {
		if v.Enabled {
			enabledCount++
		}
	}
	if enabledCount != 2 {
		t.Errorf("expected 2 enabled values, got %d", enabledCount)
	}
}

func TestParsePostmanEnvironment_InvalidJSON(t *testing.T) {
	_, err := ParsePostmanEnvironment([]byte("not json"))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestParsePostmanEnvironment_NoName(t *testing.T) {
	_, err := ParsePostmanEnvironment([]byte(`{"values": []}`))
	if err == nil {
		t.Error("expected error for missing name")
	}
}

func TestFlattenRequests_EmptyCollection(t *testing.T) {
	requests := FlattenRequests(&PostmanCollection{
		Info: PostmanInfo{Name: "Empty", Schema: "v2.1"},
		Item: []PostmanItem{},
	})

	if len(requests) != 0 {
		t.Errorf("expected 0 requests for empty collection, got %d", len(requests))
	}
}

func TestReconstructURL(t *testing.T) {
	u := &PostmanURL{
		Host: []string{"api", "example", "com"},
		Path: []string{"v1", "users"},
		Query: []PostmanKV{
			{Key: "page", Value: "1"},
			{Key: "limit", Value: "10"},
		},
	}

	expected := "api.example.com/v1/users?page=1&limit=10"
	got := reconstructURL(u)
	if got != expected {
		t.Errorf("expected %q, got %q", expected, got)
	}
}

func TestReconstructURL_NoHost(t *testing.T) {
	u := &PostmanURL{
		Path: []string{"api", "health"},
	}

	got := reconstructURL(u)
	if !strings.HasPrefix(got, "localhost/") {
		t.Errorf("expected localhost fallback, got %q", got)
	}
}
