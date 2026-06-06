# GoPost: Addressing Every Postman Pain Point — Implementation Roadmap

> 📋 Track progress: [[TODO]] &nbsp;|&nbsp; 🎯 Why these matter: [[POSTMAN_PAIN_POINTS]]

> **Goal:** Build the API client developers actually want — fast, native, local-first, Git-friendly, and free.  
> **Principle:** Every feature must serve the core workflow: compose → send → inspect → iterate. Nothing else earns its place.

---

## Table of Contents
1. [Architecture Principles](#architecture-principles)
2. [Phase 0: Foundation (Already Done)](#phase-0-foundation-already-done)
3. [Phase 1: Git-Friendly Storage (Week 1–2)](#phase-1-git-friendly-storage-week-12)
4. [Phase 2: CLI Runner for CI/CD (Week 2–3)](#phase-2-cli-runner-for-cicd-week-23)
5. [Phase 3: `.http` File & Curl Interop (Week 3–4)](#phase-3-http-file--curl-interop-week-34)
6. [Phase 4: GraphQL First-Class Support (Week 4–6)](#phase-4-graphql-first-class-support-week-46)
7. [Phase 5: WebSocket & SSE Support (Week 6–7)](#phase-5-websocket--sse-support-week-67)
8. [Phase 6: Request Scripting Engine (Week 7–9)](#phase-6-request-scripting-engine-week-79)
9. [Phase 7: Polish & Performance (Week 9–10)](#phase-7-polish--performance-week-910)
10. [Phase 8: Distribution & Marketing (Week 10–11)](#phase-8-distribution--marketing-week-1011)
11. [Architecture Diagrams](#architecture-diagrams)
12. [Success Metrics](#success-metrics)

---

## Architecture Principles

Every design decision follows these rules:

| Principle | Rule |
|---|---|
| **Local First** | Data never leaves the machine unless the user explicitly exports it |
| **Git Native** | Storage format is human-readable and diff-friendly by default |
| **Single Binary** | One executable. No runtime, no Node.js, no Docker, no npm install |
| **Keyboard Driven** | Every action has a shortcut. Power users never touch the mouse |
| **Composable** | Every feature is a standalone Go package with a clear interface |
| **Zero Config** | Works out of the box. Sensible defaults for everything |
| **Progressive Disclosure** | Simple things are simple. Advanced features are one click away, not in your face |

---

## Phase 0: Foundation (Already Done)

These are already implemented and form the bedrock:

| What | How | Status |
|---|---|---|
| Native desktop via Wails v3 | Go backend + React frontend, no Electron | ✅ |
| No account required | Local JSON storage in `~/.gopost/` | ✅ |
| Offline-first | All data local, no cloud sync | ✅ |
| Multiple themes | GitHub Dark, High Contrast, Dracula, Light, One Dark | ✅ |
| Real PTY terminal | xterm.js + Go PTY via WebSocket (`/api/terminal`) | ✅ |
| Curl import | Paste curl in URL bar → auto-populates method/headers/body/auth | ✅ |
| Tab-based editor | Multiple requests open simultaneously, horizontal tabs | ✅ |
| Toast notifications | Sonner-based feedback for every action | ✅ |
| Keyboard shortcuts | `Ctrl+Enter` send, `Ctrl+S` save, `Ctrl+F` search, `Ctrl+I` import | ✅ |
| Resizable panels | Custom drag-to-resize hook for request list / editor / history | ✅ |
| History panel | Slide-out from right sidebar icon | ✅ |
| Import/Export | JSON import/export with replace/merge/preview modes | ✅ |
| Collection runner | Run all requests in a collection, pass/fail summary | ✅ |
| Environment variables | `{{variable}}` syntax with enable/disable per variable | ✅ |
| Auth types | None, Bearer, Basic, API Key (header or query) | ✅ |
| Request methods | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS | ✅ |
| Body modes | Raw, Form URL Encoded, Multipart, Binary | ✅ |
| Query params | Key-value with enable/disable per param | ✅ |
| Headers editor | Key-value editor with add/remove | ✅ |
| Response viewer | Status badge, timing, scrollable body | ✅ |

---

## Phase 1: Git-Friendly Storage (Week 1–2)

### Pain Point Addressed
> Postman stores collections as monolithic JSON blobs. Renaming a request produces 80 lines of unreadable diff. Merge conflicts are unresolvable.

### Solution: Directory-Per-Collection Format

Replace the current monolithic JSON store with a filesystem-native structure:

```
~/.gopost/
├── collections/
│   ├── my-api/
│   │   ├── collection.gopost.json       # Name, description, metadata only
│   │   ├── requests/
│   │   │   ├── get-users.gopost.json    # One file per request
│   │   │   ├── create-user.gopost.json
│   │   │   └── update-user.gopost.json
│   │   └── environments/
│   │       ├── development.gopost.json
│   │       └── production.gopost.json
│   └── another-api/
│       ├── collection.gopost.json
│       └── requests/
│           └── health-check.gopost.json
├── history/
│   └── history.gopost.json              # Flat file, append-only
└── settings/
    └── preferences.gopost.json
```

### Benefits
- **Clean diffs:** Change one request → one file changes. No noise.
- **Mergeable:** Git can merge individual request files. No JSON conflict nightmares.
- **Reviewable:** PR diffs show exactly which endpoints changed.
- **Portable:** Copy a `requests/` directory to share. No export needed.
- **`.gitignore` friendly:** Put `~/.gopost/` in any repo and version-control what you want.

### Implementation Plan

#### Step 1.1: Data Model Changes (`app/pkg/models/models.go`)

```go
// CollectionMetadata — separate from request data
type CollectionManifest struct {
    Name        string    `json:"name"`
    Description string    `json:"description"`
    Version     int       `json:"version"`     // Schema version for migrations
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
    Order       []string  `json:"order"`       // Request IDs in display order
}

// Request file — self-contained
type RequestFile struct {
    ID          string            `json:"id"`
    Name        string            `json:"name"`
    Method      string            `json:"method"`
    URL         string            `json:"url"`
    Headers     map[string]string  `json:"headers"`
    Body        string            `json:"body"`
    Auth        RequestAuth       `json:"auth"`
    Description string            `json:"description"`
    CreatedAt   time.Time         `json:"created_at"`
    UpdatedAt   time.Time         `json:"updated_at"`
}
```

#### Step 1.2: New Storage Layer (`app/pkg/storage/gitstore.go`)

```go
package storage

type GitStore struct {
    basePath string // ~/.gopost/collections/
}

func (s *GitStore) SaveRequest(collectionID, requestID string, req *models.RequestFile) error {
    path := filepath.Join(s.basePath, collectionID, "requests", requestID+".gopost.json")
    return writePrettyJSON(path, req) // json.MarshalIndent for human readability
}

func (s *GitStore) GetRequest(collectionID, requestID string) (*models.RequestFile, error) {
    path := filepath.Join(s.basePath, collectionID, "requests", requestID+".gopost.json")
    return readJSON[models.RequestFile](path)
}

func (s *GitStore) ListRequests(collectionID string) ([]*models.RequestFile, error) {
    dir := filepath.Join(s.basePath, collectionID, "requests")
    entries, _ := os.ReadDir(dir)
    // Read manifest for ordering, then load each file
    manifest := s.GetManifest(collectionID)
    // Return requests in manifest.Order sequence
}
```

#### Step 1.3: Migration Path

Don't break existing users. Add a migration:

```go
func (s *GitStore) MigrateFromLegacy(oldStore *Storage) error {
    collections, _ := oldStore.GetCollections()
    for _, col := range collections {
        s.createCollectionDir(col.ID)
        s.SaveManifest(col.ID, &CollectionManifest{...})
        requests, _ := oldStore.GetRequests(col.ID)
        for _, req := range requests {
            s.SaveRequest(col.ID, req.ID, convertToRequestFile(req))
        }
    }
}
```

Run migration on first startup if `~/.gopost/collections/` doesn't exist but old JSON files do.

#### Step 1.4: Frontend Changes

- **Zero UI changes required.** The storage format is transparent to the React frontend.
- The API layer (`api.js`) already communicates via Go bindings. The bindings return the same data structures regardless of storage backend.
- Add a "Reveal in Finder" button in collection context menu → opens `~/.gopost/collections/my-api/`

#### Step 1.5: `.gitignore` Template

Ship a `.gopost.gitignore` template:
```gitignore
# GoPost data directory — version control what you need
.gopost/
!.gopost/collections/
!.gopost/collections/**/*.gopost.json
.gopost/history/
.gopost/settings/
```

#### Success Criteria
- [ ] Rename a request → exactly 1 file changes with a 5-line diff
- [ ] Create a new request → 1 new file + 1 line added to manifest `order` array
- [ ] Delete a request → 1 file deleted + 1 line removed from manifest
- [ ] `git merge` on two branches that added different requests works without conflict
- [ ] Existing JSON data auto-migrates on first launch

---

## Phase 2: CLI Runner for CI/CD (Week 2–3)

### Pain Point Addressed
> Postman requires Newman (separate npm package) for CI. It's slow, requires Node.js, and output is hard to parse. No single-binary solution.

### Solution: `gopost run` — Single Binary Collection Runner

```bash
# Run a collection
gopost run ./my-api \
  --env production \
  --reporter junit \
  --output test-results.xml \
  --parallel 4 \
  --timeout 30s

# Just check exit code
gopost run ./my-api --env staging && echo "All passed"

# Run a single request
gopost run ./my-api/requests/create-user.gopost.json --env development
```

### Implementation Plan

#### Step 2.1: New CLI Entry Point (`cmd/gopost/main.go` or `main_cli.go`)

```go
package main

import (
    "flag"
    "os"
    "gopost/app/pkg/runner"
)

func main() {
    var (
        collection = flag.String("collection", "", "Path to collection directory")
        envFile    = flag.String("env", "", "Environment file path")
        reporter   = flag.String("reporter", "console", "console|junit|json")
        output     = flag.String("output", "", "Output file path")
        parallel   = flag.Int("parallel", 1, "Number of parallel workers")
        timeout    = flag.Duration("timeout", 30*time.Second, "Per-request timeout")
    )
    flag.Parse()

    if *collection == "" {
        // GUI mode — launch Wails app (existing behavior)
        launchGUI()
        return
    }

    // CLI mode
    cfg := runner.Config{...}
    result := runner.Run(cfg)
    reporter.Write(result, os.Stdout, *output)
    os.Exit(result.ExitCode())
}
```

#### Step 2.2: Runner Engine (`app/pkg/runner/runner.go`)

```go
package runner

type Config struct {
    CollectionPath string
    Environment    *models.Environment
    Parallel       int
    Timeout        time.Duration
    StopOnFail     bool
}

type Result struct {
    Total     int           `json:"total"`
    Passed    int           `json:"passed"`
    Failed    int           `json:"failed"`
    Duration  time.Duration `json:"duration_ms"`
    Requests  []RequestResult `json:"requests"`
}

type RequestResult struct {
    Name     string `json:"name"`
    Method   string `json:"method"`
    URL      string `json:"url"`
    Status   int    `json:"status"`
    Passed   bool   `json:"passed"`
    Duration int64  `json:"duration_ms"`
    Error    string `json:"error,omitempty"`
}

func Run(cfg Config) *Result {
    requests := loadRequests(cfg.CollectionPath)
    
    if cfg.Parallel > 1 {
        return runParallel(requests, cfg)
    }
    return runSequential(requests, cfg)
}
```

#### Step 2.3: Reporters (`app/pkg/runner/reporters/`)

```
app/pkg/runner/reporters/
├── console.go    # Pretty terminal output with colors
├── junit.go      # JUnit XML for GitHub Actions, GitLab CI, Jenkins
└── json.go       # Machine-readable JSON for custom CI pipelines
```

**JUnit Reporter:**
```go
func (r *JUnitReporter) Write(result *Result, w io.Writer) error {
    suite := JUnitTestSuite{
        Name:     result.CollectionName,
        Tests:    result.Total,
        Failures: result.Failed,
        Time:     result.Duration.Seconds(),
        TestCases: make([]JUnitTestCase, len(result.Requests)),
    }
    // Map each request result to a <testcase> element
    return xml.NewEncoder(w).Encode(suite)
}
```

**Console Reporter:**
```
╔══════════════════════════════════════════╗
║  My API — 12 tests                       ║
╠══════════════════════════════════════════╣
║  ✓ GET  /users           200   234ms    ║
║  ✓ POST /users           201   567ms    ║
║  ✗ GET  /users/999       404    89ms    ║
║  ✓ PUT  /users/1         200   312ms    ║
╠══════════════════════════════════════════╣
║  11 passed  1 failed  2345ms total      ║
╚══════════════════════════════════════════╝
```

#### Step 2.4: GitHub Actions Integration

Ship a GitHub Action (`action.yml`):

```yaml
name: 'GoPost API Tests'
inputs:
  collection:
    description: 'Path to collection directory'
    required: true
  environment:
    description: 'Environment name'
    required: false
runs:
  using: 'composite'
  steps:
    - uses: actions/setup-go@v5
      with: { go-version: '1.22' }
    - run: go install github.com/berksunduri/gopost/cmd/gopost@latest
      shell: bash
    - run: gopost run ${{ inputs.collection }} --reporter junit --output test-results.xml
      shell: bash
    - uses: actions/upload-artifact@v4
      with: { name: api-test-results, path: test-results.xml }
```

#### Step 2.5: Build System

Update the build to produce two artifacts:
```makefile
build:
    # GUI app (existing)
    wails build -o bin/GoPost.app
    # CLI binary (new)
    GOOS=darwin GOARCH=arm64 go build -o bin/gopost ./cmd/gopost
```

Homebrew formula for distribution:
```ruby
class Gopost < Formula
  desc "Fast, native API client and test runner"
  homepage "https://github.com/berksunduri/gopost"
  url "https://github.com/berksunduri/gopost/releases/download/v1.0.0/gopost-darwin-arm64.tar.gz"
  sha256 "..."
  
  def install
    bin.install "gopost"        # CLI
    prefix.install "GoPost.app" # GUI
  end
end
```

#### Success Criteria
- [ ] `gopost run ./my-api --reporter junit` produces valid JUnit XML
- [ ] GitHub Actions workflow runs a collection and uploads results
- [ ] Exit code is 0 when all pass, 1 when any fail
- [ ] Parallel execution with `--parallel 4` is faster than sequential
- [ ] `gopost --version` prints version info
- [ ] `gopost run --help` shows all flags with examples

---

## Phase 3: `.http` File & Curl Interop (Week 3–4)

### Pain Point Addressed
> Postman uses a proprietary format. Users who prefer `.http` files (VS Code REST Client, IntelliJ) can't use their existing files. No way to round-trip between tools.

### Solution: Full `.http` File Round-Trip

```
# my-api.gopost.http — works in VS Code, IntelliJ, AND GoPost

### Get Users
GET https://api.example.com/users
Authorization: Bearer {{token}}
Content-Type: application/json

### Create User
POST https://api.example.com/users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}

### Update User
PUT https://api.example.com/users/{{user_id}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "name": "Jane Doe"
}
```

### Implementation Plan

#### Step 3.1: `.http` Parser (`app/pkg/parser/httpfile.go`)

```go
package parser

type HTTPFileRequest struct {
    Name    string
    Method  string
    URL     string
    Headers map[string]string
    Body    string
}

// ParseHTTPFile reads a .http file and returns all requests
func ParseHTTPFile(r io.Reader) ([]HTTPFileRequest, error) {
    scanner := bufio.NewScanner(r)
    var requests []HTTPFileRequest
    var current *HTTPFileRequest
    
    for scanner.Scan() {
        line := scanner.Text()
        
        // Comment with ### starts a new request
        if strings.HasPrefix(line, "###") {
            if current != nil {
                requests = append(requests, *current)
            }
            current = &HTTPFileRequest{
                Name:    strings.TrimPrefix(line, "### "),
                Headers: make(map[string]string),
            }
            continue
        }
        
        // Request line: METHOD URL
        if current.Method == "" && isRequestLine(line) {
            parts := strings.SplitN(line, " ", 2)
            current.Method = parts[0]
            current.URL = parts[1]
            continue
        }
        
        // Header: Key: Value
        if strings.Contains(line, ": ") && current.Body == "" {
            parts := strings.SplitN(line, ": ", 2)
            current.Headers[parts[0]] = parts[1]
            continue
        }
        
        // Body — everything after blank line
        if line == "" && current.Method != "" {
            // Switch to body mode
            continue
        }
        
        if current.Method != "" {
            current.Body += line + "\n"
        }
    }
    
    if current != nil {
        requests = append(requests, *current)
    }
    
    return requests, nil
}
```

#### Step 3.2: `.http` Generator

```go
// WriteHTTPFile exports a collection as a .http file
func WriteHTTPFile(w io.Writer, requests []HTTPFileRequest) error {
    for _, req := range requests {
        fmt.Fprintf(w, "### %s\n", req.Name)
        fmt.Fprintf(w, "%s %s\n", req.Method, req.URL)
        for k, v := range req.Headers {
            fmt.Fprintf(w, "%s: %s\n", k, v)
        }
        if req.Body != "" {
            fmt.Fprintf(w, "\n%s\n", strings.TrimSpace(req.Body))
        }
        fmt.Fprintln(w)
    }
    return nil
}
```

#### Step 3.3: Integration Points

**Import:** "Import .http File" button in toolbar → parses all requests → creates a new collection.

**Export:** Collection context menu → "Export as .http" → writes `.http` file.

**Drag & Drop:** Drag a `.http` file onto the GoPost window → auto-import.

**Watch Mode (Stretch):** `gopost watch ./api.http` → watches the file for changes, reloads requests on save. This enables the VS Code + GoPost workflow: edit `.http` in VS Code, execute with pretty GUI in GoPost.

#### Step 3.4: Curl Paste Enhancements

The existing curl parser handles most cases. Add edge cases:

```go
// Additional curl flags to support
var curlFlags = map[string]func(*RequestFile, string){
    "--cookie":      func(r *RequestFile, v string) { r.Headers["Cookie"] = v },
    "--cookie-jar":  func(r *RequestFile, v string) { /* store cookies */ },
    "--form":        func(r *RequestFile, v string) { /* multipart form data */ },
    "--json":        func(r *RequestFile, v string) { r.Body = v; r.Headers["Content-Type"] = "application/json" },
    "--oauth2-bearer": func(r *RequestFile, v string) { r.Auth = RequestAuth{Type: "bearer", Token: v} },
    "-w":            nil, // write-out format, ignore
    "--connect-to":  nil, // ignore
    "--proxy":       nil, // ignore
    "--cert":        func(r *RequestFile, v string) { r.ClientCert = v },
    "--key":         func(r *RequestFile, v string) { r.ClientKey = v },
}
```

#### Success Criteria
- [ ] Paste a multi-request `.http` file → creates a collection with all requests
- [ ] Export a collection → produces valid `.http` file that works in VS Code REST Client
- [ ] Drag `.http` file onto window → auto-import
- [ ] `curl --json '{"x":1}' -H "Auth: Bearer xyz" https://api.example.com` parses correctly
- [ ] `curl -F "file=@image.png" https://upload.example.com` creates multipart request

---

## Phase 4: GraphQL First-Class Support (Week 4–6)

### Pain Point Addressed
> Postman added GraphQL support years late and it's bolted on. Schema introspection is slow. No autocomplete. Query variables are in a separate tab. The experience is worse than dedicated GraphQL tools.

### Solution: Native GraphQL with Schema Introspection

### Implementation Plan

#### Step 4.1: GraphQL Client (`app/pkg/graphql/client.go`)

```go
package graphql

type Client struct {
    httpClient *http.Client
}

type IntrospectionResult struct {
    Schema struct {
        QueryType        TypeRef `json:"queryType"`
        MutationType     TypeRef `json:"mutationType"`
        SubscriptionType TypeRef `json:"subscriptionType"`
        Types            []Type  `json:"types"`
    } `json:"__schema"`
}

func (c *Client) Introspect(endpoint string) (*IntrospectionResult, error) {
    query := `query { __schema { queryType { name } mutationType { name } types { name kind fields { name args { name type { name kind ofType { name kind } } } type { name kind ofType { name kind } } } } } }`
    body := map[string]string{"query": query}
    // POST to endpoint, parse result
}

func (c *Client) Execute(endpoint, query string, variables map[string]interface{}, headers map[string]string) (*Response, error) {
    body := map[string]interface{}{
        "query":     query,
        "variables": variables,
    }
    // POST to endpoint
}
```

#### Step 4.2: GraphQL Editor Component (`frontend/src/components/GraphQLEditor.jsx`)

New tab type in the request editor: when the method selector is set to "GRAPHQL", show a different editor:

```
┌─────────────────────────────────────────────────────────┐
│ [GRAPHQL ▼] [My Query           ] [https://api.../graphql] [Send] │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────────────┐ │
│ │ Query               │ │ Response                    │ │
│ │                     │ │                             │ │
│ │ query GetUsers {    │ │ {                           │ │
│ │   users(first: 10) {│ │   "data": {                 │ │
│ │     id              │ │     "users": [              │ │
│ │     name            │ │       { "id": "1", ... }    │ │
│ │     email           │ │     ]                       │ │
│ │   }                 │ │   }                         │ │
│ │ }                   │ │ }                           │ │
│ │                     │ │                             │ │
│ └─────────────────────┘ └─────────────────────────────┘ │
│ ┌─────────────┐ ┌──────────────┐                        │
│ │ Variables   │ │ Headers      │                        │
│ │ {"n": 10}   │ │ Auth: Bearer │                        │
│ └─────────────┘ └──────────────┘                        │
│ [Introspect Schema] [Prettify] [Copy as curl]           │
└─────────────────────────────────────────────────────────┘
```

Key features:
- **Monaco Editor** for the query pane (syntax highlighting, bracket matching)
- **Schema explorer sidebar** — clickable tree of types, fields, and args from introspection
- **Autocomplete** — field names, arguments, types pop up as you type (powered by introspection result)
- **Variables pane** — JSON editor with validation
- **History** — each query execution is saved and replayable
- **Copy as curl** — generates `curl -X POST -d '{"query":"..."}'` equivalent

#### Step 4.3: Schema Explorer

After running introspection, build a tree:

```go
type SchemaTree struct {
    Types map[string]*GraphQLType
    Root  *GraphQLType // Query type
}

func BuildSchemaTree(introspection *IntrospectionResult) *SchemaTree {
    tree := &SchemaTree{Types: make(map[string]*GraphQLType)}
    for _, t := range introspection.Schema.Types {
        tree.Types[t.Name] = &GraphQLType{
            Name:   t.Name,
            Kind:   t.Kind,
            Fields: t.Fields,
        }
    }
    tree.Root = tree.Types[introspection.Schema.QueryType.Name]
    return tree
}
```

#### Step 4.4: Method Selector Extension

Add "GRAPHQL" to the HTTP method dropdown:

```jsx
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "GRAPHQL"];
```

When "GRAPHQL" is selected, the URL input placeholder changes to `https://api.example.com/graphql` and the body editor is replaced with the GraphQL editor.

#### Success Criteria
- [ ] Introspect any GraphQL endpoint and display the schema as a tree
- [ ] Type field names and get autocomplete suggestions from the schema
- [ ] Execute queries and see formatted JSON responses
- [ ] Query variables pane works with `$variable` syntax
- [ ] Switch between REST and GraphQL mode preserves URL and headers
- [ ] Introspection result is cached per endpoint (stored in `~/.gopost/graphql/`)

---

## Phase 5: WebSocket & SSE Support (Week 6–7)

### Pain Point Addressed
> Postman added WebSocket support in v8 but it's unreliable. No SSE (Server-Sent Events) support. Message history is lost when you close the tab. Can't save WebSocket connections as part of a collection.

### Solution: WebSocket + SSE as First-Class Request Types

### Implementation Plan

#### Step 5.1: WebSocket Client (`app/pkg/websocket/client.go`)

```go
package websocket

type WSClient struct {
    conn     *gorilla.Conn
    messages []Message
    onMessage func(Message)
}

type Message struct {
    Direction string    // "send" or "receive"
    Data      string    // Raw message content
    Type      string    // "text" or "binary"
    Timestamp time.Time
    Size      int       // Byte count
}

func (c *WSClient) Connect(url string, headers map[string]string) error {
    dialer := gorilla.Dialer{}
    conn, _, err := dialer.Dial(url, toHTTPHeader(headers))
    c.conn = conn
    go c.readLoop()
    return err
}

func (c *WSClient) Send(data string) error {
    c.messages = append(c.messages, Message{Direction: "send", Data: data, Timestamp: time.Now()})
    return c.conn.WriteMessage(websocket.TextMessage, []byte(data))
}

func (c *WSClient) readLoop() {
    for {
        _, msg, err := c.conn.ReadMessage()
        if err != nil { break }
        c.messages = append(c.messages, Message{
            Direction: "receive",
            Data:      string(msg),
            Timestamp: time.Now(),
            Size:      len(msg),
        })
        if c.onMessage != nil {
            c.onMessage(c.messages[len(c.messages)-1])
        }
    }
}
```

#### Step 5.2: WebSocket Editor Component

```
┌─────────────────────────────────────────────────────────┐
│ [WS ▾] [wss://echo.example.com  ] [Connect] [Disconnect] │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ↑ 10:23:45.123  {"type": "message", "data": {...}}  │ │
│ │ ↓ 10:23:45.456  {"type": "subscribe", "channel": 1} │ │
│ │ ↑ 10:23:45.789  {"type": "ack"}                     │ │
│ │ ↑ 10:23:46.012  {"type": "message", "data": {...}}  │ │
│ │                                                     │ │
│ │ Connected · 4 messages · 2.3 KB                     │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ {"type": "subscribe", "channel": 1}                 │ │
│ └─────────────────────────────────────────────────────┘ │
│ [Send] [Format JSON] [Clear]                            │
└─────────────────────────────────────────────────────────┘
```

Key features:
- **Message log** — full history with timestamps, colored by direction
- **JSON formatting** — auto-prettify JSON messages
- **Connection state indicator** — green dot = connected, red = disconnected, yellow = connecting
- **Message input** — multi-line with Ctrl+Enter to send
- **Save as request** — persists the WebSocket URL and headers as a saved request in a collection
- **Auto-reconnect** — optional toggle

#### Step 5.3: SSE Client (`app/pkg/sse/client.go`)

```go
package sse

type SSEClient struct {
    events []SSEEvent
}

type SSEEvent struct {
    ID    string
    Event string
    Data  string
    Time  time.Time
}

func (c *SSEClient) Connect(url string) error {
    resp, err := http.Get(url)
    scanner := bufio.NewScanner(resp.Body)
    var current SSEEvent
    for scanner.Scan() {
        line := scanner.Text()
        if line == "" {
            c.events = append(c.events, current)
            current = SSEEvent{}
            continue
        }
        if strings.HasPrefix(line, "id: ") {
            current.ID = strings.TrimPrefix(line, "id: ")
        } else if strings.HasPrefix(line, "event: ") {
            current.Event = strings.TrimPrefix(line, "event: ")
        } else if strings.HasPrefix(line, "data: ") {
            current.Data += strings.TrimPrefix(line, "data: ")
        }
    }
}
```

#### Step 5.4: Method Selector Extension

```jsx
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "GRAPHQL", "WS", "SSE"];
```

#### Success Criteria
- [ ] Connect to any WebSocket endpoint, send messages, receive responses
- [ ] Message history persists within a tab session
- [ ] WebSocket connections can be saved as collection requests
- [ ] SSE endpoint streams events in real-time with auto-scroll
- [ ] Connection state is clearly visible (green/red/yellow dot)

---

## Phase 6: Request Scripting Engine (Week 7–9)

### Pain Point Addressed
> Postman's pre-request and test scripts are powerful but locked to JavaScript. Running them requires a full Node.js sandbox. They're slow to execute and add complexity to CI/CD.

### Solution: Embedded Scripting with Go + Starlark

Use **Starlark** (Google's Python-like configuration language, used in Bazel) as the scripting engine. It's:
- Deterministic (no I/O, no infinite loops)
- Sandboxed by design
- Embeds natively in Go via `go.starlark.net`
- Familiar syntax (Python-like)
- No external runtime needed

### Implementation Plan

#### Step 6.1: Script Engine (`app/pkg/scripting/engine.go`)

```go
package scripting

import (
    "go.starlark.net/starlark"
    "go.starlark.net/starlarkjson"
)

type Engine struct {
    globals starlark.StringDict
}

func NewEngine() *Engine {
    return &Engine{
        globals: starlark.StringDict{
            "request":  nil, // Set per-execution
            "response": nil, // Set after execution
            "env":      nil, // Environment variables
            "json":     starlarkjson.Module,
            "base64":   base64Module(),
            "hmac":     hmacModule(),
            "assert":   assertModule(),
        },
    }
}

// PreRequestScript runs before the HTTP request
// The script can modify the request object (headers, body, URL)
func (e *Engine) PreRequestScript(script string, req *models.HTTPRequest, env map[string]string) (*models.HTTPRequest, error) {
    e.globals["request"] = requestToStarlark(req)
    e.globals["env"] = envToStarlark(env)
    
    _, err := starlark.ExecFile(&starlark.Thread{Name: "pre-request"}, "pre_request.gopost", script, e.globals)
    if err != nil {
        return nil, fmt.Errorf("pre-request script: %w", err)
    }
    
    // Read modified request back from globals
    return starlarkToRequest(e.globals["request"]), nil
}

// TestScript runs after the HTTP response
// The script can make assertions and set test results
func (e *Engine) TestScript(script string, req *models.HTTPRequest, resp *Response, env map[string]string) (*TestResult, error) {
    e.globals["request"] = requestToStarlark(req)
    e.globals["response"] = responseToStarlark(resp)
    e.globals["env"] = envToStarlark(env)
    
    _, err := starlark.ExecFile(&starlark.Thread{Name: "test"}, "test.gopost", script, e.globals)
    
    return &TestResult{
        Passed: err == nil,
        Error:  errStr(err),
    }, nil
}
```

#### Step 6.2: Built-in Scripting API

```python
# Pre-request script example
def pre_request():
    # Set headers dynamically
    request.headers["Authorization"] = "Bearer " + env["token"]
    request.headers["X-Request-ID"] = str(uuid())
    
    # Set body from template
    request.body = json.encode({
        "name": "Test User",
        "timestamp": str(now()),
    })

# Test script example
def test():
    # Assertions
    assert.status(200)
    assert.header("content-type", "application/json")
    assert.json_path("$.users[0].name", "John")
    assert.response_time_less_than(1000)
    
    # Extract and store in environment
    env["user_id"] = str(response.json()["users"][0]["id"])
```

Custom built-in functions:
```go
func uuidModule() *starlarkstruct.Module {
    return &starlarkstruct.Module{
        Name: "uuid",
        Members: starlark.StringDict{
            "generate": starlark.NewBuiltin("uuid.generate", func(...) { 
                return starlark.String(uuid.New().String())
            }),
        },
    }
}

func assertModule() *starlarkstruct.Module {
    return &starlarkstruct.Module{
        Name: "assert",
        Members: starlark.StringDict{
            "status":        starlark.NewBuiltin("assert.status", assertStatus),
            "header":        starlark.NewBuiltin("assert.header", assertHeader),
            "json_path":     starlark.NewBuiltin("assert.json_path", assertJSONPath),
            "body_contains": starlark.NewBuiltin("assert.body_contains", assertBodyContains),
            "response_time_less_than": starlark.NewBuiltin("...", assertResponseTime),
        },
    }
}
```

#### Step 6.3: Editor Integration

Add two new tabs to the request editor: "Pre-request" and "Tests"

```
[Headers | Auth | Params | Body | Pre-request | Tests | Response]
```

Each shows a code editor (Monaco or simple textarea with syntax highlighting) with the script content.

#### Success Criteria
- [ ] Write a pre-request script that sets a dynamic header → header appears in the request
- [ ] Write a test script with assertions → pass/fail shown in response area
- [ ] Extract a value from response JSON and store it in environment → usable in next request
- [ ] Scripts execute in the CLI runner → CI/CD tests work
- [ ] Script execution timeout (5s default) prevents infinite loops
- [ ] Error messages are readable and point to the exact line

---

## Phase 7: Polish & Performance (Week 9–10)

### 7.1: Startup Time Optimization

**Goal:** Cold start in <500ms.

```go
// Lazy-load expensive packages
// Don't import xterm, GraphQL, or scripting engine until needed
// Use build tags to exclude GUI code from CLI binary
// +build !cli
```

```go
// Pre-warm the HTTP client pool
var sharedTransport = &http.Transport{
    MaxIdleConns:        100,
    IdleConnTimeout:     90 * time.Second,
    DisableCompression:  false,
}
```

#### 7.2: Request Execution Performance

- Connection pooling (reuse TCP connections across requests in a collection run)
- HTTP/2 support
- Response streaming for large payloads (don't buffer 100MB in memory)
- Request cancellation (clicking Send again cancels the previous request)

#### 7.3: Auto-Save

Never lose work. Every change to a request is auto-saved after 2 seconds of inactivity:

```jsx
useEffect(() => {
  const timer = setTimeout(() => {
    if (isDirty) handleSave();
  }, 2000);
  return () => clearTimeout(timer);
}, [method, url, headers, body, auth]);
```

Show a subtle "Saved" indicator that fades after 1 second.

#### 7.4: Undo/Redo

Full undo/redo stack for the request editor:
- Ctrl+Z to undo changes to method, URL, headers, body, auth
- Ctrl+Shift+Z or Ctrl+Y to redo
- 50-entry history per tab

Implementation: use a simple diff-based undo stack.

#### 7.5: Drag & Drop Requests

Drag requests between collections in the sidebar to reorganize.

#### 7.6: Keyboard Shortcut Reference

Add a `?` keyboard shortcut that shows a modal with all shortcuts:

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` | Send request |
| `Ctrl+S` | Save request |
| `Ctrl+F` | Focus search |
| `Ctrl+I` | Import file |
| `Ctrl+N` | New request tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `` Ctrl+` `` | Toggle terminal |
| `?` | Show shortcuts |
| `Ctrl+1-5` | Switch to Headers/Auth/Params/Body/Response tab |

#### 7.7: Response Comparison

Diff two responses side-by-side:

```
[Response A] | [Response B] | [Diff]
```

Useful for comparing staging vs production responses or before/after API changes.

---

## Phase 8: Distribution & Marketing (Week 10–11)

### 8.1: Landing Page

Create `gopost.dev` with:
- 30-second demo video (compose → send → inspect → terminal → CLI run)
- Performance comparison table (startup, RAM, binary size vs Postman/Bruno/Insomnia)
- Download buttons for macOS (ARM + Intel), Windows, Linux (AppImage + deb)
- "No account required. No cloud. No bullshit." as hero text

### 8.2: Homebrew

```bash
brew install berksunduri/tap/gopost
```

### 8.3: Chocolatey (Windows)

```powershell
choco install gopost
```

### 8.4: GitHub Releases

Automated CI/CD via GitHub Actions:
```yaml
on:
  push:
    tags: ['v*']
jobs:
  release:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - run: make build-${{ matrix.os }}
      - uses: softprops/action-gh-release@v1
        with:
          files: bin/*
```

### 8.5: Documentation Site

- Getting Started (5-minute guide)
- CLI Reference (`gopost run --help`)
- Scripting API Reference
- `.gopost` file format specification
- VS Code extension for `.gopost` file syntax highlighting

---

## Architecture Diagrams

### Storage Architecture (Phase 1)

```
┌─────────────────────────────────────────┐
│              React Frontend             │
│  (Collections.jsx, RequestEditor.jsx)   │
└────────────────┬────────────────────────┘
                 │ Wails v3 Bindings (Go ↔ JS)
┌────────────────▼────────────────────────┐
│           App Layer (app.go)             │
│  CRUD operations, no storage knowledge  │
└────────────────┬────────────────────────┘
                 │ Interface: StorageBackend
┌────────────────▼────────────────────────┐
│         Storage Backend                  │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │  LegacyStore  │  │    GitStore      │ │
│  │  (JSON blob)  │  │  (per-file)      │ │
│  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         ~/.gopost/ (Filesystem)          │
│  collections/{name}/requests/{id}.json   │
│  collections/{name}/collection.json      │
│  history/history.json                    │
│  settings/preferences.json               │
└─────────────────────────────────────────┘
```

### CLI vs GUI Build (Phase 2)

```
cmd/gopost/main.go
    │
    ├── no --collection flag? → launchGUI()
    │       │
    │       └── Wails v3 App (existing main.go)
    │
    └── --collection flag? → runCLI()
            │
            ├── Parse flags
            ├── Load collection
            ├── Run requests
            ├── Generate reports
            └── os.Exit(code)
```

### Request Pipeline (Phase 6)

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Compose  │ →  │  Script  │ →  │ Execute  │ →  │  Script  │
│ Request  │    │ (Pre-req)│    │  HTTP    │    │  (Test)  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  Test Result     │
                                              │  Pass/Fail + Log │
                                              └─────────────────┘
```

---

## Success Metrics

| Metric | Current | Target |
|---|---|---|
| Startup time (cold) | ~2s | <500ms |
| RAM at idle | ~50MB | <100MB |
| Binary size (macOS) | ~15MB | <20MB |
| Time to first request | ~10s | <5s |
| Collection runner (12 requests) | ~3s | <1s (parallel) |
| Git diff for renamed request | 80 lines | 1 line |
| `.http` file round-trip | N/A | Lossless |
| GraphQL introspection | N/A | <2s |
| WS connection time | N/A | <100ms |

---

## Summary: The Complete Feature Matrix

| Feature | Postman | Insomnia | Bruno | **GoPost (Target)** |
|---|---|---|---|---|
| No account required | ❌ | ✅ | ✅ | ✅ |
| Offline-first | ❌ | ✅ | ✅ | ✅ |
| Native (non-Electron) | ❌ | ❌ | ✅ | ✅ |
| Git-friendly storage | ❌ | ❌ | ✅ | ✅ |
| CLI runner | ❌ (Newman) | ✅ (inso) | ✅ | ✅ |
| Curl import | ✅ | ❌ | ❌ | ✅ |
| Real terminal | ❌ | ❌ | ❌ | ✅ |
| Multiple themes | ❌ | ✅ | ❌ | ✅ |
| GraphQL | ⚠️ (late) | ✅ | ❌ | ✅ |
| WebSocket | ⚠️ (buggy) | ❌ | ❌ | ✅ |
| SSE | ❌ | ❌ | ❌ | ✅ |
| `.http` file support | ❌ | ❌ | ❌ | ✅ |
| Scripting engine | ✅ (JS) | ❌ | ❌ | ✅ (Starlark) |
| Horizontal tabs | ✅ | ❌ | ❌ | ✅ |
| Free | ⚠️ (limited) | ✅ | ✅ | ✅ |
| Open source | ❌ | ✅ | ✅ | ✅ |
