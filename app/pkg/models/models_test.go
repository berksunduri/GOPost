package models

import (
	"testing"
	"time"
)

func TestRequestFileToHTTPRequest(t *testing.T) {
	now := time.Now()
	rf := &RequestFile{
		ID:               "req-1",
		Name:             "Get Users",
		Method:           "GET",
		URL:              "https://api.example.com/users",
		Headers:          map[string]string{"Accept": "application/json"},
		Auth:             RequestAuth{Type: "bearer", Token: "tok"},
		Body:             "",
		Description:      "Fetch all users",
		PreRequestScript: "print('hi')",
		TestScript:       "assert.status(expected=200)",
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	req := rf.ToHTTPRequest("col-1")

	if req.CollectionID != "col-1" {
		t.Errorf("CollectionID: want col-1, got %s", req.CollectionID)
	}
	if req.ID != rf.ID {
		t.Errorf("ID: want %s, got %s", rf.ID, req.ID)
	}
	if req.Method != rf.Method {
		t.Errorf("Method: want %s, got %s", rf.Method, req.Method)
	}
	if req.URL != rf.URL {
		t.Errorf("URL: want %s, got %s", rf.URL, req.URL)
	}
	if req.Auth.Token != "tok" {
		t.Errorf("Auth.Token: want tok, got %s", req.Auth.Token)
	}
	if req.PreRequestScript != rf.PreRequestScript {
		t.Errorf("PreRequestScript mismatch")
	}
	if req.TestScript != rf.TestScript {
		t.Errorf("TestScript mismatch")
	}
}

func TestRequestFileFromHTTPRequest_Roundtrip(t *testing.T) {
	gql := &GraphQLPayload{Query: "{ me { id } }", Variables: "{}"}
	req := &HTTPRequest{
		ID:               "req-2",
		Name:             "GQL Me",
		Method:           "POST",
		URL:              "https://api.example.com/graphql",
		Headers:          map[string]string{"Content-Type": "application/json"},
		Auth:             RequestAuth{Type: "none"},
		Body:             "",
		Description:      "GraphQL introspection",
		GraphQL:          gql,
		PreRequestScript: "",
		TestScript:       "",
		CollectionID:     "col-2",
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	rf := RequestFileFromHTTPRequest(req)

	if rf.ID != req.ID {
		t.Errorf("ID: want %s, got %s", req.ID, rf.ID)
	}
	if rf.GraphQL == nil {
		t.Fatal("GraphQL payload should be set")
	}
	if rf.GraphQL.Query != gql.Query {
		t.Errorf("GraphQL.Query: want %s, got %s", gql.Query, rf.GraphQL.Query)
	}

	// Roundtrip back to HTTPRequest
	back := rf.ToHTTPRequest("col-2")
	if back.CollectionID != "col-2" {
		t.Errorf("CollectionID roundtrip: want col-2, got %s", back.CollectionID)
	}
	if back.GraphQL == nil || back.GraphQL.Query != gql.Query {
		t.Errorf("GraphQL roundtrip failed")
	}
}

func TestRequestFileFromHTTPRequest_NilGraphQL(t *testing.T) {
	req := &HTTPRequest{
		ID:      "req-3",
		Name:    "Plain GET",
		Method:  "GET",
		URL:     "https://example.com",
		Headers: map[string]string{},
		Auth:    RequestAuth{Type: "none"},
	}

	rf := RequestFileFromHTTPRequest(req)
	if rf.GraphQL != nil {
		t.Error("GraphQL should be nil when not set on original request")
	}
}

func TestExportDataFields(t *testing.T) {
	data := ExportData{
		Version:      1,
		Collections:  []Collection{{ID: "c1", Name: "My API"}},
		Requests:     []HTTPRequest{{ID: "r1", Name: "GET Root", Method: "GET", URL: "https://example.com"}},
		Environments: []Environment{{ID: "e1", Name: "Prod", Variables: map[string]interface{}{"base_url": "https://api.example.com"}}},
	}

	if data.Version != 1 {
		t.Errorf("Version: want 1, got %d", data.Version)
	}
	if len(data.Collections) != 1 {
		t.Errorf("Collections len: want 1, got %d", len(data.Collections))
	}
	if len(data.Requests) != 1 {
		t.Errorf("Requests len: want 1, got %d", len(data.Requests))
	}
	if data.Environments[0].Variables["base_url"] != "https://api.example.com" {
		t.Errorf("Environment variable mismatch")
	}
}
