# GoPost — TODO & Remaining Work

> 📖 Full roadmap: [[IMPLEMENTATION_ROADMAP]] &nbsp;|&nbsp; 🎯 Pain points: [[POSTMAN_PAIN_POINTS]]

---

## Phase 0: Foundation ✅ COMPLETE

All foundation features are implemented and working.

---

## Phase 1: Git-Friendly Storage ✅ COMPLETE

- ✅ Directory-per-collection format (`collections/{name}/requests/{name}.gopost.json`)
- ✅ `GitStore` with `sync.RWMutex`-safe read/write
- ✅ Auto-migration from legacy JSON blobs (`storage/migration.go`)
- ✅ Git operations (init, status, commit, log, push, pull) via `go-git`
- ✅ `SaveRequest` creates/renames files atomically

---

## Phase 2: CLI Runner for CI/CD 🔲 PENDING

> 📖 [[IMPLEMENTATION_ROADMAP#Phase 2]]

- [ ] `cmd/gopost/main.go` — standalone CLI binary (`gopost run`)
- [ ] Reporters: console (text), JSON, JUnit XML
- [ ] `--env` flag to set active environment
- [ ] `--filter` flag to run matching requests only
- [ ] `--timeout` flag for per-request timeout
- [ ] Exit code: 0 = all pass, 1 = failures, 2 = errors
- [ ] GitHub Actions composite action (`gopost-run@v1`)

---

## Phase 3: `.http` File & Curl Interop ✅ MOSTLY COMPLETE

> 📖 [[IMPLEMENTATION_ROADMAP#Phase 3]]

- ✅ Curl paste → auto-parse into request (in URL bar)
- ✅ `.http` file parser (`app/pkg/parser/httpfile.go`) — parse multi-request .http files
- ✅ `.http` file generator — export any collection as valid .http file
- ✅ Curl `--json` flag support (sets body + Content-Type + method)
- ✅ Curl `-F`/`--form` flag support (multipart form data)
- ✅ Curl `--oauth2-bearer` flag support
- ✅ Curl `--cert` / `--key` flag support
- ✅ UI: import `.http` file button (header bar, reads file → creates requests)
- ✅ UI: export collection as `.http` (hover menu, downloads file)
- [ ] Drag-drop `.http` file onto window → auto-import
- [ ] Watch mode: `gopost watch ./api.http`

---

## Phase 4: GraphQL First-Class Support ✅ NEARLY COMPLETE

> 📖 [[IMPLEMENTATION_ROADMAP#Phase 4]]

- ✅ `GRAPHQL` method in the dropdown
- ✅ Query editor (monospace, syntax-friendly)
- ✅ Variables editor (JSON with real-time validation)
- ✅ Operation name input
- ✅ Schema introspection with browsable tree
- ✅ Click field in schema → inserts into query
- ✅ Response viewer with `data`/`errors` split
- ✅ `GraphQLPayload` model + persistent storage
- ✅ `ExecuteGraphQLRequest` + `IntrospectGraphQLSchema` in Go backend
- ✅ Mock GraphQL server (`cmd/graphql-mock`) for testing
- [ ] Persist introspected schemas to disk (survive app restart)
- [ ] Syntax highlighting in query editor (needs Monaco/CodeMirror integration)
- [ ] Query autocomplete from introspected schema
- [ ] Collection runner supports GraphQL requests
- [ ] History entries show query/variables distinctly
- [ ] "Copy as curl" for GraphQL requests
- [ ] Prettify button for query formatting
- [ ] `.graphql` file import support

---

## Phase 5: WebSocket & SSE Support 🔲 PENDING

> 📖 [[IMPLEMENTATION_ROADMAP#Phase 5]]

- [ ] Add `WS` and `SSE` to method dropdown
- [ ] WebSocket client (`app/pkg/websocket/client.go`) using `gorilla/websocket`
- [ ] Connect/disconnect UI with connection state indicator
- [ ] Message log with timestamps, colored by direction (send/receive)
- [ ] Multi-line message input with Ctrl+Enter to send
- [ ] JSON auto-formatting for messages
- [ ] Save WebSocket URL + headers as saved request in collection
- [ ] Auto-reconnect toggle
- [ ] SSE client (`app/pkg/sse/client.go`) — parse `id:`, `event:`, `data:` lines
- [ ] SSE event log with auto-scroll
- [ ] Message history persistence in tab

---

## Phase 6: Request Scripting Engine 🔲 PENDING

> 📖 [[IMPLEMENTATION_ROADMAP#Phase 6]]

- [ ] Starlark scripting engine (`app/pkg/scripting/engine.go`)
- [ ] `pm.request` object: `url`, `method`, `headers`, `body`
- [ ] `pm.response` object: `status`, `code`, `headers`, `body`, `time`
- [ ] `pm.environment` object: `get()`, `set()`, `unset()`
- [ ] `pm.test()` function: `pm.test("name", fn)`
- [ ] `pm.expect()` chai-style assertions
- [ ] Pre-request scripts (run before sending)
- [ ] Test scripts (run after receiving response)
- [ ] Script editor with syntax highlighting
- [ ] Script sandboxing (timeout, no file/network access)
- [ ] Collection runner executes pre-request + test scripts

---

## Phase 7: Polish & Performance 🔲 PENDING

> 📖 [[IMPLEMENTATION_ROADMAP#Phase 7]]

- [ ] Startup time < 500ms (profile and optimize)
- [ ] Undo/redo for request edits
- [ ] Drag-drop to reorder requests in a collection
- [ ] Drag-drop to move requests between collections
- [ ] Keyboard shortcuts reference panel (press `?`)
- [ ] Loading state for schema introspection
- [ ] Better error messages (network errors, DNS failures, timeouts)
- [ ] Request body size counter
- [ ] Response body size display
- [ ] Syntax highlighting for JSON/XML/HTML in response viewer
- [ ] Fold/collapse JSON paths in response

---

## Phase 8: Distribution & Marketing 🔲 PENDING

> 📖 [[IMPLEMENTATION_ROADMAP#Phase 8]]

- [ ] Homebrew formula (`brew install gopost`)
- [ ] Chocolatey package (`choco install gopost`)
- [ ] GitHub Releases with signed binaries (macOS, Windows, Linux)
- [ ] Auto-update mechanism (Sparkle for macOS, custom for others)
- [ ] Landing page / documentation site
- [ ] Screenshots and demo GIF in README
- [ ] CI/CD pipeline for cross-platform builds

---

## Known Bugs & Small Fixes

- [ ] Terminal: lingering garbage characters on first launch
- [ ] Git status polling: 2-second interval → consider `fsnotify`
- [ ] Auto-save regression: verify 2-second debounce still works
- [ ] `Reveal in Finder`: `exec.Command("open", dir)` is macOS-only

---

## File Reference

| Path | Purpose |
|---|---|
| `app/pkg/models/models.go` | Data models including `GraphQLPayload`, `CachedGraphQLSchema` |
| `app/pkg/storage/gitstore.go` | Git-friendly filesystem storage |
| `app/pkg/storage/migration.go` | Legacy → GitStore auto-migration |
| `app/pkg/gitops/gitops.go` | Pure Go Git operations |
| `app/pkg/parser/httpfile.go` | .http file parser + generator |
| `app/app.go` | Wails app with all exposed Go methods |
| `main.go` | Entry point + HTTP API routes |
| `cmd/graphql-mock/main.go` | Mock GraphQL server for testing |
| `frontend/src/api.js` | API client (Wails bridge + HTTP fallback) |
| `frontend/src/lib/parseCurl.js` | Curl command parser (enhanced) |
| `frontend/src/context/AppContext.jsx` | Global React state |
| `frontend/src/components/Collections.jsx` | Collection list with import/export buttons |
| `frontend/src/components/RequestEditor.jsx` | Main request editor (REST + GraphQL) |
| `frontend/src/components/request/GraphQLQueryEditor.jsx` | GQL query + operation name editor |
| `frontend/src/components/request/GraphQLVariablesEditor.jsx` | JSON variables editor with validation |
| `frontend/src/components/request/GraphQLSchemaExplorer.jsx` | Schema introspection browser |
| `frontend/src/components/request/GQLResponseViewer.jsx` | GQL response with data/errors split |
| `plans/IMPLEMENTATION_ROADMAP.md` | Full phased implementation plan |
| `plans/POSTMAN_PAIN_POINTS.md` | Competitive research document |
