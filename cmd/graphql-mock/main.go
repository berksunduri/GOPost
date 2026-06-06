// graphql-mock — a tiny mock GraphQL server for testing GoPost's GraphQL features.
//
// Usage:
//
//	go run ./cmd/graphql-mock
//
// Starts on http://localhost:4567/graphql
// Supports introspection, queries, mutations, variables, and errors.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// ==================== Schema (used for introspection) ====================

// We serve this as the __schema field when introspection is requested.
var mockSchema = map[string]any{
	"queryType":        map[string]any{"name": "Query"},
	"mutationType":     map[string]any{"name": "Mutation"},
	"subscriptionType": nil,
	"types": []any{
		// --- Query ---
		map[string]any{
			"kind": "OBJECT", "name": "Query", "description": "Root query type",
			"fields": []any{
				map[string]any{
					"name": "users", "description": "Returns all users",
					"args": []any{},
					"type": map[string]any{"kind": "LIST", "ofType": map[string]any{"kind": "OBJECT", "name": "User"}},
				},
				map[string]any{
					"name": "user", "description": "Returns a single user by ID",
					"args": []any{
						map[string]any{
							"name": "id", "description": "User ID",
							"type": map[string]any{"kind": "NON_NULL", "ofType": map[string]any{"kind": "SCALAR", "name": "ID"}},
						},
					},
					"type": map[string]any{"kind": "OBJECT", "name": "User"},
				},
				map[string]any{
					"name": "posts", "description": "Returns all posts",
					"args": []any{},
					"type": map[string]any{"kind": "LIST", "ofType": map[string]any{"kind": "OBJECT", "name": "Post"}},
				},
			},
		},
		// --- Mutation ---
		map[string]any{
			"kind": "OBJECT", "name": "Mutation", "description": "Root mutation type",
			"fields": []any{
				map[string]any{
					"name": "createUser", "description": "Creates a new user",
					"args": []any{
						map[string]any{
							"name": "name",
							"type": map[string]any{"kind": "NON_NULL", "ofType": map[string]any{"kind": "SCALAR", "name": "String"}},
						},
						map[string]any{
							"name": "email",
							"type": map[string]any{"kind": "NON_NULL", "ofType": map[string]any{"kind": "SCALAR", "name": "String"}},
						},
					},
					"type": map[string]any{"kind": "OBJECT", "name": "User"},
				},
			},
		},
		// --- User ---
		map[string]any{
			"kind": "OBJECT", "name": "User", "description": "A user in the system",
			"fields": []any{
				map[string]any{
					"name": "id",
					"type": map[string]any{"kind": "NON_NULL", "ofType": map[string]any{"kind": "SCALAR", "name": "ID"}},
				},
				map[string]any{
					"name": "name",
					"type": map[string]any{"kind": "NON_NULL", "ofType": map[string]any{"kind": "SCALAR", "name": "String"}},
				},
				map[string]any{
					"name": "email",
					"type": map[string]any{"kind": "NON_NULL", "ofType": map[string]any{"kind": "SCALAR", "name": "String"}},
				},
				map[string]any{
					"name": "role",
					"type": map[string]any{"kind": "SCALAR", "name": "UserRole"},
				},
				map[string]any{
					"name": "posts",
					"type": map[string]any{"kind": "LIST", "ofType": map[string]any{"kind": "OBJECT", "name": "Post"}},
				},
			},
		},
		// --- Post ---
		map[string]any{
			"kind": "OBJECT", "name": "Post", "description": "A blog post",
			"fields": []any{
				map[string]any{
					"name": "id",
					"type": map[string]any{"kind": "NON_NULL", "ofType": map[string]any{"kind": "SCALAR", "name": "ID"}},
				},
				map[string]any{
					"name": "title",
					"type": map[string]any{"kind": "NON_NULL", "ofType": map[string]any{"kind": "SCALAR", "name": "String"}},
				},
				map[string]any{
					"name": "author",
					"type": map[string]any{"kind": "OBJECT", "name": "User"},
				},
			},
		},
		// --- UserRole enum ---
		map[string]any{
			"kind": "ENUM", "name": "UserRole", "description": "User access level",
			"enumValues": []any{
				map[string]any{"name": "ADMIN", "description": "Full access"},
				map[string]any{"name": "EDITOR", "description": "Can edit content"},
				map[string]any{"name": "VIEWER", "description": "Read-only access"},
			},
		},
		// --- Scalars ---
		map[string]any{"kind": "SCALAR", "name": "ID", "description": "Unique identifier"},
		map[string]any{"kind": "SCALAR", "name": "String", "description": "UTF-8 string"},
		map[string]any{"kind": "SCALAR", "name": "Int", "description": "Signed 32-bit integer"},
		map[string]any{"kind": "SCALAR", "name": "Float", "description": "Double-precision float"},
		map[string]any{"kind": "SCALAR", "name": "Boolean", "description": "true or false"},
	},
}

// ==================== Mock Data ====================

var users = []map[string]any{
	{"id": "1", "name": "Alice Chen", "email": "alice@example.com", "role": "ADMIN"},
	{"id": "2", "name": "Bob Martinez", "email": "bob@example.com", "role": "EDITOR"},
	{"id": "3", "name": "Carol Johnson", "email": "carol@example.com", "role": "VIEWER"},
}

var posts = []map[string]any{
	{"id": "101", "title": "Getting Started with GraphQL", "author_id": "1"},
	{"id": "102", "title": "Why REST is Dead", "author_id": "2"},
	{"id": "103", "title": "Type-Safe APIs with Codegen", "author_id": "1"},
}

func userByID(id string) map[string]any {
	for _, u := range users {
		if u["id"] == id {
			return u
		}
	}
	return nil
}

func postsByAuthor(authorID string) []map[string]any {
	var result []map[string]any
	for _, p := range posts {
		if p["author_id"] == authorID {
			author := userByID(authorID)
			pc := copyMap(p)
			delete(pc, "author_id")
			if author != nil {
				pc["author"] = author
			}
			result = append(result, pc)
		}
	}
	return result
}

func copyMap(m map[string]any) map[string]any {
	c := make(map[string]any, len(m))
	for k, v := range m {
		c[k] = v
	}
	return c
}

// ==================== Request Handling ====================

type gqlRequest struct {
	Query         string         `json:"query"`
	Variables     map[string]any `json:"variables"`
	OperationName string         `json:"operationName"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/graphql", handleGraphQL)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><body style="font-family:sans-serif;padding:2rem">
			<h1>🧪 GoPost GraphQL Mock</h1>
			<p>Send POST requests to <code>/graphql</code></p>
			<h3>Example queries:</h3>
			<pre>query { users { id name email role } }</pre>
			<pre>query($id: ID!) { user(id: $id) { id name email posts { title } } }</pre>
			<pre>mutation { createUser(name: "Dave", email: "dave@test.com") { id name email } }</pre>
		</body></html>`)
	})

	addr := ":4567"
	log.Printf("🧪 GraphQL mock server starting on http://localhost%s/graphql", addr)
	log.Printf("   Try: curl -X POST http://localhost%s/graphql -H 'Content-Type: application/json' -d '{\"query\":\"{ users { id name } }\"}'", addr)

	server := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}

func handleGraphQL(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		writeError(w, "Only POST requests are supported")
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, "Failed to read body")
		return
	}

	var req gqlRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, fmt.Sprintf("Invalid JSON: %v", err))
		return
	}

	query := strings.TrimSpace(req.Query)
	if query == "" {
		writeError(w, "No query provided")
		return
	}

	// Merge variables into a flat map for easy lookup
	vars := req.Variables
	if vars == nil {
		vars = map[string]any{}
	}

	// --- Introspection ---
	if strings.Contains(query, "__schema") {
		writeJSON(w, map[string]any{
			"data": map[string]any{
				"__schema": mockSchema,
			},
		})
		return
	}

	// --- Route queries ---
	result := executeQuery(query, vars)
	writeJSON(w, result)
}

func executeQuery(query string, vars map[string]any) map[string]any {
	// --- users ---
	if strings.Contains(query, "users") {
		return map[string]any{"data": map[string]any{"users": users}}
	}

	// --- user(id) ---
	if strings.Contains(query, "user(") {
		id := extractArg(query, "id")
		// Override with variable if present
		if v, ok := vars["id"]; ok {
			id = fmt.Sprintf("%v", v)
		}
		if id == "" {
			return map[string]any{
				"data":   nil,
				"errors": []any{map[string]any{"message": "Field \"user\" argument \"id\" of type \"ID!\" is required"}},
			}
		}
		user := userByID(id)
		if user == nil {
			return map[string]any{
				"data":   map[string]any{"user": nil},
				"errors": []any{map[string]any{"message": fmt.Sprintf("User not found: %s", id), "path": []any{"user"}, "extensions": map[string]any{"code": "NOT_FOUND"}}},
			}
		}
		u := copyMap(user)
		// Attach posts if requested
		if strings.Contains(query, "posts") {
			u["posts"] = postsByAuthor(id)
		}
		return map[string]any{"data": map[string]any{"user": u}}
	}

	// --- posts ---
	if strings.Contains(query, "posts") && !strings.Contains(query, "user(") {
		result := make([]map[string]any, 0, len(posts))
		for _, p := range posts {
			pc := copyMap(p)
			delete(pc, "author_id")
			author := userByID(p["author_id"].(string))
			if author != nil {
				pc["author"] = author
			}
			result = append(result, pc)
		}
		return map[string]any{"data": map[string]any{"posts": result}}
	}

	// --- createUser mutation ---
	if strings.Contains(query, "createUser") {
		name := extractArg(query, "name")
		email := extractArg(query, "email")

		if v, ok := vars["name"]; ok {
			name = fmt.Sprintf("%v", v)
		}
		if v, ok := vars["email"]; ok {
			email = fmt.Sprintf("%v", v)
		}

		if name == "" || email == "" {
			return map[string]any{
				"errors": []any{map[string]any{"message": "name and email are required for createUser"}},
			}
		}

		newID := fmt.Sprintf("%d", len(users)+1)
		newUser := map[string]any{"id": newID, "name": name, "email": email, "role": "VIEWER"}
		users = append(users, newUser)

		return map[string]any{"data": map[string]any{"createUser": newUser}}
	}

	// --- Fallback ---
	return map[string]any{
		"errors": []any{map[string]any{"message": fmt.Sprintf("Unknown query. Try: { users { id name } }")}},
	}
}

// extractArg does a naive string search for `argName: "value"` or `argName: value` in the query.
func extractArg(query, argName string) string {
	// Try quoted: argName: "value"
	idx := strings.Index(query, argName+":")
	if idx == -1 {
		return ""
	}
	rest := strings.TrimSpace(query[idx+len(argName)+1:])

	// If next char is quote, extract until closing quote
	if strings.HasPrefix(rest, "\"") {
		rest = rest[1:]
		end := strings.Index(rest, "\"")
		if end == -1 {
			return rest
		}
		return rest[:end]
	}

	// Unquoted: take until space, comma, paren, or newline
	end := strings.IndexAny(rest, " ,)\n}")
	if end == -1 {
		return rest
	}
	return rest[:end]
}

func writeJSON(w http.ResponseWriter, v any) {
	data, _ := json.MarshalIndent(v, "", "  ")
	w.Write(data)
}

func writeError(w http.ResponseWriter, msg string) {
	w.WriteHeader(http.StatusBadRequest)
	writeJSON(w, map[string]any{"errors": []any{map[string]any{"message": msg}}})
}
