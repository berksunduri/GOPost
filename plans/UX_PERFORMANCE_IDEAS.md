# GoPost — UX, Feature & Performance Ideas

> Based on a full codebase audit of the current state (June 2026). Complements the existing `IMPLEMENTATION_ROADMAP.md` without repeating what's already planned.

---

## Table of Contents

1. [What the App Is](#what-the-app-is)
2. [UX Problems to Fix Now](#ux-problems-to-fix-now)
3. [What Users Will Want Next](#what-users-will-want-next)
4. [Performance Improvements](#performance-improvements)
5. [Implementation Details](#implementation-details)

---

## What the App Is

GoPost is a **native desktop API client** (Postman alternative) built with Go + Wails v3 + React. It covers the full developer API workflow:

- HTTP, GraphQL, WebSocket, SSE request building and execution
- Collections and environments with `{{variable}}` substitution
- Git-friendly per-file storage in `~/.gopost/`
- Built-in Git panel per collection (init, commit, push, pull)
- Starlark pre-request and test scripting
- `.http` file import/export, curl paste
- CLI runner (`gopost run`) for CI/CD
- Request history with replay
- 5 themes, keyboard shortcuts, resizable panels, horizontal tabs

The app is not Electron — it's a single ~15 MB native Go binary. No account, no cloud, no telemetry.

---

## UX Problems to Fix Now

These are friction points visible in the current code that degrade the daily-use experience.

### 1. No Empty State Guidance

**Problem:** When the app opens for the first time with no collections, the sidebar and main area are blank. A new user has no idea what to do.

**Fix:** Add an empty state in `Collections.jsx` and the main editor area.

```jsx
// In Collections.jsx when collections.length === 0
<div className="empty-state">
  <IconApi size={48} className="text-muted" />
  <h3>{t('emptyState.title')}</h3>      // "No collections yet"
  <p>{t('emptyState.description')}</p>  // "Create a collection or drag a .http file here"
  <Button onClick={handleNewCollection}>{t('emptyState.cta')}</Button>
</div>
```

**Also add:** a first-run walkthrough hint (not a modal, just a subtle inline tooltip chain that disappears on interaction).

---

### 2. Tab Overflow is Unhandled

**Problem:** Opening many tabs in `TabBar.jsx` pushes tabs off-screen with no scroll or overflow handling. Tabs become invisible and unreachable.

**Fix:** Add horizontal scroll to the tab bar with arrow buttons when overflow occurs.

```jsx
// TabBar.jsx — detect overflow and show scroll arrows
const [canScrollLeft, setCanScrollLeft] = useState(false);
const [canScrollRight, setCanScrollRight] = useState(false);

// On render, check scrollWidth vs clientWidth
// Render <button onClick={() => tabsRef.current.scrollBy(-120, 0)}> when canScrollLeft
```

**Also:** `Ctrl+Tab` / `Ctrl+Shift+Tab` tab cycling (already planned in shortcuts but not fully wired).

---

### 3. Response Body Has No Search

**Problem:** For large JSON responses, there's no way to search within the response body. Users must copy to an external editor to find a specific field.

**Fix:** Add `Ctrl+F` within `ResponseViewer` to open an inline search bar that highlights matches.

```jsx
// ResponseViewer.jsx
const [searchOpen, setSearchOpen] = useState(false);
const [searchQuery, setSearchQuery] = useState('');

// Ctrl+F inside the response area toggles the search bar
// Highlight matches with <mark> tags in the pretty-printed JSON
```

---

### 4. No Visual Diff Between Environments

**Problem:** When switching environments, users don't know which variables changed. Switching from `development` to `production` silently changes base URLs and tokens.

**Fix:** When switching environments, show a brief diff toast:

```
Switched to production
  BASE_URL: http://localhost:3000 → https://api.myapp.com
  TOKEN:    dev-token-xxx → *** (hidden)
```

Implementation: diff the current and previous environment objects on selection change in `EnvironmentsContext.jsx`.

---

### 5. Save Confirmation is Invisible

**Problem:** Auto-save fires every 2 seconds but provides no feedback. Users can't tell if their work was saved or lost after a crash.

**Fix:** A non-intrusive "Saved" indicator in the tab label or toolbar — a small dot or checkmark that appears for 1.5s after a successful save. Dirty state should also be visible (unsaved indicator like VS Code's dot on the tab).

```jsx
// TabBar.jsx — show dirty indicator per tab
<span className={`tab-dirty ${tab.dirty ? 'visible' : ''}`}>●</span>
```

---

### 6. No Request Duplication

**Problem:** There's no way to duplicate an existing request. Users must manually recreate similar requests when building a new endpoint that shares headers/auth.

**Fix:** Add "Duplicate" to the request context menu in `Collections.jsx`. The backend already has `SaveRequest` — just call it with a new ID and `(copy)` appended to the name.

---

### 7. Collection Run Results Are Not Persistent

**Problem:** Running a collection shows a pass/fail summary but it's lost when you close the modal. There's no history of previous runs.

**Fix:** Persist collection run reports to `~/.gopost/runs/{collectionId}/{timestamp}.json`. Add a "Run History" sub-panel in the Collections sidebar.

---

### 8. No Inline Variable Preview

**Problem:** When typing a URL like `{{BASE_URL}}/users`, users can't see what `BASE_URL` resolves to without opening the environment panel.

**Fix:** On hover over `{{VARIABLE}}` tokens in the URL bar and body editor, show a tooltip with the resolved value from the active environment.

```jsx
// URLBar.jsx — wrap {{...}} tokens in a span with data-value
// Show tooltip on hover
```

---

### 9. No Request Ordering or Folders

**Problem:** Requests inside a collection are in a flat list. As collections grow past 20+ requests, navigation becomes tedious. There are no folders/groups.

**Fix:** Add folder support to the collection storage model. One folder = one subdirectory in the collection's `requests/` directory. Folders are collapsible in the sidebar.

Backend change in `app/pkg/models`: add `FolderID *string` to `RequestFile`. Storage change: create `requests/{folderSlug}/{requestId}.gopost.json`.

---

### 10. Settings Panel is Sparse

**Problem:** The current settings only cover themes and keybindings. There's no way to configure timeouts, proxy, SSL verification, default headers, or certificate management.

**Fix:** Build out `settings/SettingsPanel.jsx` with these sections:
- **Appearance**: theme (current)
- **Network**: default request timeout, proxy URL, SSL verification toggle
- **Editor**: font size, word wrap, JSON auto-format on paste
- **Shortcuts**: (already there)
- **Data**: storage path display, export all data, clear history

---

## What Users Will Want Next

Features that developers using API clients consistently ask for and that competitors handle poorly.

### 1. Response Body Formatting Options

Beyond JSON pretty-print, users need:
- **XML formatting** (many enterprise APIs still return XML)
- **HTML preview** (render raw HTML response inline)
- **Image preview** (if `Content-Type` is `image/*`, show the image)
- **Binary download** (save response body to disk for `application/octet-stream`)
- **CSV table view** (tabular display when `Content-Type: text/csv`)

**How:** Detect `Content-Type` in `ResponseViewer.jsx` and render the appropriate viewer component.

---

### 2. gRPC Support

**Why:** gRPC is the standard for internal microservices. None of the major native API clients handle it well. GoPost already has WebSocket — gRPC is the next protocol users will ask for.

**How:**
- Use `google.golang.org/grpc` on the backend
- Parse `.proto` files for method discovery (like schema introspection for GraphQL)
- Add `GRPC` to the method selector
- Implement unary, server-streaming, client-streaming, and bidirectional streaming

**Impact:** This is a genuine differentiator. No other lightweight native client does gRPC well.

---

### 3. OpenAPI / Swagger Import

**Why:** Every team has an OpenAPI spec. Being able to import it and auto-generate a full collection is one of the most-requested features across all API client tools.

**How:**
- Parse `openapi.json` / `openapi.yaml` / `swagger.json`
- For each path + method combination, create a request in the collection
- Populate path parameters, query parameters, request body schema, and authentication from the spec
- Use `github.com/getkin/kin-openapi` Go library for parsing

```go
// app/pkg/parser/openapi.go
func ImportOpenAPI(spec []byte) ([]*models.RequestFile, error) {
    loader := openapi3.NewLoader()
    doc, err := loader.LoadFromData(spec)
    // Iterate doc.Paths, create RequestFile per operation
}
```

---

### 4. Request Chaining / Variables from Responses

**Why:** The most common real-world workflow is:
1. POST /login → get `token`
2. Use `token` in all subsequent requests

The Starlark scripting engine can already do this (`env["token"] = response.json()["token"]`), but the UX is too technical. Most users won't write scripts for this.

**Fix:** Add a "Extract from response" UI in the request editor — a simple table where users define:
- Variable name: `ACCESS_TOKEN`
- JSONPath: `$.data.token`
- Target environment: `development`

This auto-generates the Starlark test script behind the scenes.

---

### 5. Mock Server

**Why:** Frontend developers need to work against an API that doesn't exist yet or is unreliable. A built-in mock server is the missing half of the API client story.

**How:**
- Add a "Mock" toggle to any request in a collection
- Define the mock response: status code, headers, body (static or dynamic via template)
- Start a local HTTP server on a configurable port that serves these mocks
- Display `http://localhost:PORT` as the mock server URL

```go
// app/pkg/mock/server.go
type MockServer struct {
    port     int
    handlers map[string]MockHandler // method+path → handler
    server   *http.Server
}
```

This is a genuine killer feature that none of the native lightweight clients have built-in.

---

### 6. Environment Variable Secrets Management

**Why:** Storing `PROD_API_KEY=sk-live-abc123` in plain JSON on disk is insecure. Developers need a way to mark variables as secrets.

**Fix:**
- Add `secret: true` flag to environment variables
- On save, store secret values encrypted using the OS keychain (macOS: Keychain, Windows: Credential Store, Linux: libsecret)
- Display `***` in the UI for secret values
- In `.gopost.json` files, store only a reference to the keychain entry, never the value

**Backend:** Use `github.com/zalando/go-keyring` — cross-platform OS keychain access in Go.

---

### 7. Request Documentation / Notes

**Why:** Teams use API clients collaboratively. Requests need descriptions explaining what they do, what the response means, and what edge cases to watch for.

**Fix:**
- Add a `description` field (Markdown) to each request
- Render it in a collapsible panel below the URL bar
- Include the description in `.http` file export as a comment block
- In collection runner output, include descriptions in the HTML report

---

### 8. Multi-Tab Response Comparison

**Why:** A/B testing API changes, comparing staging vs production, verifying a fix — all require running the same request twice and comparing output.

**Fix:** Add a "Compare" button in the response viewer that opens a second pane and diffs the two responses. Reference the `useUndo.js` approach — store the last N responses per tab and allow diffing any two.

---

### 9. Postman Collection Import

**Why:** Every Postman user has existing collections. The migration path to GoPost must be zero-friction.

**Fix:**
- Import Postman Collection v2.1 JSON format
- Import Postman environments
- Map Postman's `pm.environment.set()` JavaScript scripts to Starlark equivalents automatically

```go
// app/pkg/parser/postman.go
type PostmanCollection struct {
    Info  PostmanInfo   `json:"info"`
    Item  []PostmanItem `json:"item"`
    // ...
}
func ImportPostman(data []byte) ([]*models.RequestFile, error)
```

---

### 10. Multi-Language Code Generation

**Why:** After building a request in GoPost, developers often need to use it in code. The "Copy as curl" already exists. Add:

- **Copy as fetch** (JavaScript)
- **Copy as axios** (JavaScript)
- **Copy as Go net/http**
- **Copy as Python requests**
- **Copy as HTTPie**

These are static string templates filled from the current request state. No external dependency.

---

## Performance Improvements

### 1. Virtual Scrolling for Large Collections

**Problem:** When a collection has 100+ requests, rendering all of them in the DOM causes visible lag on scroll and focus.

**Fix:** Use a virtual list in `Collections.jsx`. Only render visible items + a small overscan buffer.

```jsx
// Use @tanstack/react-virtual (already a common dep in shadcn stacks)
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: requests.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 36, // row height in px
});
```

**Impact:** A collection with 500 requests renders in the same time as one with 10.

---

### 2. Lazy Context Initialization

**Problem:** All contexts initialize simultaneously on startup: `loadCollections`, `loadEnvironments`, `loadHistory` fire in `AppBootstrap.jsx` in parallel but all block the initial render.

**Fix:** Prioritize. Collections + active environment are needed immediately. History can load after the first paint. Git status can load on demand (when the Git panel is opened).

```jsx
// AppBootstrap.jsx
useEffect(() => {
  // Critical path — load before first paint
  Promise.all([loadCollections(), loadEnvironments()])
    .then(() => {
      // Deferred — load after UI is visible
      loadHistory();
    });
}, []);
```

**Impact:** Perceived startup time drops because the UI becomes interactive before history is loaded.

---

### 3. Debounce Search Aggressively

**Problem:** The search in `RequestsContext.jsx` runs on every keystroke. With large collections, this is a synchronous O(n) filter on every input event.

**Fix:** Debounce the search query with a 150ms delay. For very large datasets, move the search to Go (binary search over sorted request names).

```jsx
// AppStatusContext.jsx — debounce setSearchQuery
const debouncedSearch = useMemo(
  () => debounce((q) => setSearchQuery(q), 150),
  []
);
```

---

### 4. Memoize Request List Items

**Problem:** When any request changes (e.g., save), React re-renders the entire request list because the parent context reference changes.

**Fix:** Memoize individual request row components.

```jsx
// In Collections.jsx
const RequestRow = React.memo(({ request, onSelect, onDelete }) => {
  // ...
}, (prev, next) => prev.request.updatedAt === next.request.updatedAt);
```

---

### 5. Response Body Virtualization

**Problem:** Large JSON responses (>1MB) are rendered as a single text block. Scrolling is janky. Pretty-printing 1MB of JSON blocks the main thread.

**Fix:**
- Pretty-print JSON in a Web Worker (off main thread)
- For responses >100KB, show the raw body by default with a "Format" button (user opts into the CPU cost)
- Cap the displayed response at 10MB; offer "Save to file" for larger responses

```jsx
// ResponseViewer.jsx
const [isFormatted, setIsFormatted] = useState(responseSize < 102400);
// Format button visible when size >= 100KB
```

---

### 6. Tab State Persistence Across App Restarts

**Problem:** Every app restart loses all open tabs. Users must re-navigate to their working requests.

**Fix:** Persist the tab state (open tabs, active tab) to `localStorage` or `~/.gopost/settings/preferences.gopost.json`. On startup, restore the previous session.

```jsx
// TabsContext.jsx
// On tab change: localStorage.setItem('gopost_tabs', JSON.stringify(tabs))
// On init: const saved = JSON.parse(localStorage.getItem('gopost_tabs') ?? '[]')
```

---

### 7. Go HTTP Client Pooling

**Problem:** Each request execution may create a new HTTP transport. This means a new TCP connection + TLS handshake on every send, which adds 100–500ms to every request.

**Fix:** Use a shared `http.Transport` with connection pooling across all requests.

```go
// app/app.go
var sharedTransport = &http.Transport{
    MaxIdleConns:        100,
    MaxIdleConnsPerHost: 10,
    IdleConnTimeout:     90 * time.Second,
    TLSHandshakeTimeout: 10 * time.Second,
    ForceAttemptHTTP2:   true,
}

var sharedClient = &http.Client{
    Transport: sharedTransport,
    Timeout:   30 * time.Second,
}
```

**Impact:** Sequential requests to the same host (common in collection runs) skip the handshake. 50–200ms saved per request.

---

### 8. Preload Wails Bridge Early

**Problem:** The Wails bridge (`bridge.js`) probes multiple `window.go` candidates. This probe runs on first API call, adding latency to the initial `loadCollections`.

**Fix:** Trigger bridge discovery during app initialization before any data load, not lazily on first call.

```js
// main.jsx
import { discoverBridge } from './lib/bridge';
discoverBridge(); // fire early, result cached
```

---

### 9. Incremental Collection Loading

**Problem:** `loadCollections` fetches all collections and all their requests in one call. On a large workspace with 20+ collections and 500+ requests, this is a slow synchronous read of hundreds of JSON files.

**Fix:** Two-phase loading:
1. Load collection manifests only (collection names, IDs, request counts) — fast
2. Load request details lazily when a collection is expanded

```go
// app/app.go
func (a *App) GetCollections() []CollectionSummary        // fast: just metadata
func (a *App) GetCollectionRequests(id string) []Request  // on demand
```

---

## Implementation Details

### Priority Order

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | Empty state / first-run guidance | 1 day | High (conversion) |
| P0 | Tab overflow handling | 1 day | High (daily use) |
| P0 | Dirty indicator + save feedback | 0.5 day | High (trust) |
| P1 | Response body search | 2 days | High (daily use) |
| P1 | Request duplication | 0.5 day | Medium |
| P1 | Tab state persistence | 1 day | High (daily use) |
| P1 | Inline variable preview on hover | 1.5 days | Medium |
| P1 | HTTP client connection pooling | 0.5 day | High (perf) |
| P2 | OpenAPI import | 3–4 days | Very High (acquisition) |
| P2 | Postman collection import | 3–4 days | Very High (acquisition) |
| P2 | Multi-language code generation | 2 days | Medium |
| P2 | Request folders | 3 days | Medium |
| P2 | Secrets management (OS keychain) | 2 days | High (security) |
| P3 | Response comparison / diff | 3 days | Medium |
| P3 | Mock server | 1 week | High (differentiation) |
| P3 | gRPC support | 2 weeks | High (differentiation) |
| P3 | Response body virtualization | 2 days | Medium (edge case) |

---

### Frontend Architecture Notes

**Avoid adding more useEffect hooks.** The codebase rule is to use `useState` with previous-value comparison for derived state. Use `useEffect` only for browser API sync (resize observers, keyboard listeners, WebSocket lifecycle).

**i18n discipline.** Every new UI string must go through `i18n.js`. The current dictionary covers ~90 strings; new features must add their keys there. No hardcoded English in JSX.

**Context coupling.** The current context split has cross-context dependencies (e.g., `CollectionsContext` calls `useRequests`, `useHistory`). New features should not introduce more cross-context calls — prefer passing callbacks as props or lifting state up to a coordinator context to keep the dependency graph acyclic.

---

### Backend Architecture Notes

**All new Go packages go under `app/pkg/`.** The `pkg/` root is the legacy web handler stack — do not add new code there.

**Test coverage.** `app/pkg/parser/`, `app/pkg/scripting/`, and `app/pkg/runner/` are the most testable packages. New features in these areas should include Go unit tests.

**No external process spawning.** GoPost's value is being a single self-contained binary. New features must not require Node.js, Python, Docker, or other external runtimes.
