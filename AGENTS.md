# AGENTS.md — PostGO / GoPost

Operating manual for coding agents. Read this before exploring. Code and tests beat this file on conflict; update this file when you change the facts it asserts.

## What this is

Git-friendly HTTP workspace + CI runner (desktop + CLI). Go + Wails v3 + React/Vite. Data is plain `.gopost.json` files on disk — no cloud, no accounts.

Module: `gopost` (Go 1.25+). App name in packaging: **GoPost**.

## Layout (where to look)

| Area | Path | Notes |
|------|------|-------|
| Wails / HTTP bootstrap | `main.go` | App entry, HTTP fallback routes for browser/dev |
| App façade (Wails-bound) | `app/app.go` | Large; methods are the desktop API surface |
| Domain packages | `app/pkg/*` | Prefer changing logic here, not in the façade |
| Models | `app/pkg/models/` | Shared structs |
| Git-friendly storage | `app/pkg/storage/` | `GitStore` — collections/requests/envs as files |
| Workspace root | `app/pkg/storage/workspace.go` | `GOPOST_DATA_DIR` / pointer / `~/.gopost` |
| Collection runner / CLI | `app/pkg/runner/`, `cmd/gopost/` | CI-friendly run + reporters |
| Imports (Postman/OpenAPI/HTTP) | `app/pkg/parser/` | |
| Scripting | `app/pkg/scripting/` | Starlark pre-request / tests |
| Mock / WS / SSE / gitops | `app/pkg/mock`, `websocket`, `sse`, `gitops` | |
| Frontend | `frontend/src/` | React 18 + Vite |
| API bridge | `frontend/src/api.js`, `bridge.js` | Wails service first; HTTP `/api/*` fallback |
| UI state | `frontend/src/context/` | Split contexts (collections, requests, env, tabs, …) |
| Request UI | `frontend/src/components/RequestEditor.jsx` | Hot path; env substitution for display/send |
| Product design lock | `docs/superpowers/specs/` | Positioning + invariants |
| Historical audits / ideas | `plans/` | Not authoritative; verify against code |

Do not invent packages. If it is not in the table, grep before assuming.

## Runtime topology

```
React UI ──bridge.js──► window.go…App (Wails) ──► app.App ──► app/pkg/*
 │
 └── fallback fetch /api/* ──► main.go HTTP routes ──► same App methods
```

- Dev Vite port: **34115** (must stay in sync: `wails.json`, `Taskfile.yml`, `frontend/vite.config.js`, `dev-frontend.sh`).
- Workspace root resolution: `--data-dir` / `SetWorkspaceDir` → `GOPOST_DATA_DIR` → `~/.gopost/settings/workspace.gopost.json` → `~/.gopost`.
- Treat anything under the workspace tree as potentially secret-bearing.

## Storage model (do not break)

`app/pkg/storage/gitstore.go` owns on-disk layout:

```
collections/<slug-or-id>/
  collection.gopost.json
  requests/*.gopost.json
environments/<slug>.gopost.json   # global to workspace (not collection-scoped)
history/history.gopost.json
settings/user-config.gopost.json
runs/
```

Invariants:

- Prefer `safeSubPath` / sanitize paths — never join raw user IDs into filesystem paths without traversal checks.
- Secrets live in request auth + env variables. Prefer `0600` / `0700` for writes.
- Do not “helpfully” normalize stored URLs by baking env values into saved JSON.
- Collection-scoped environments are **not implemented** — do not document them as if they exist.

## Critical product invariant: env substitution

`{{var}}` substitution must happen at **send/execute** time, not at **save** time.

- Runner substitutes on execute (`app/pkg/runner` — `substituteVariables`).
- `RequestEditor.jsx` `upsertRequest` persists raw `url` / `body` / `headers` (no `applyEnv` on save). `applyEnv` / `effectiveURL` are for display and send paths.
- Regression guard: if you touch save or send, verify a request with `{{baseUrl}}` still stores the template after save.

## CLI / CI loop

```bash
gopost run --data-dir . --env ci --reporter junit --output results.xml <collection>
```

`<collection>` may be a directory with `collection.gopost.json`, a `collections/` child name, or a unique manifest name. `--env-file` loads a specific env JSON. Starlark scripts run in the CLI runner.

## Frontend rules that agents forget

- User-visible strings: `frontend/src/i18n.js` (no hard-coded UI copy).
- UI/design: follow the workspace Geist Cursor rule (do not invent a local design doc).
- Prefer existing context + `api.js` methods over new ad-hoc `fetch` calls.
- Avoid unnecessary `useEffect`; sync with external systems only.
- Tests: Vitest. Coverage via `npm run test:coverage` in `frontend/`.
- Wails runtime in tests: see `frontend/src/test/wails-runtime-stub.js`.

## Go rules that agents forget

- Business logic belongs in `app/pkg/...`. Keep `app/app.go` as a thin façade when possible.
- Errors: wrap with `%w`; do not panic for expected failures (`main.go` startup panics are a known smell).
- Race-friendly tests for packages under `app/pkg`.
- Generic Go skills live under `.agents/skills/` — use them for language hygiene, not as PostGO domain docs.

## Commands (copy-paste)

```bash
# Go unit tests (matches CI gate on app/pkg coverage)
go test ./app/pkg/... -race -timeout 120s \
  -coverprofile=coverage.out -covermode=atomic
go test ./app -race -timeout 120s
go tool cover -func=coverage.out | awk '/^total:/{print}'
# CI fails app/pkg total coverage below 84%

# Frontend
cd frontend && npm ci && npm test
cd frontend && npm run test:coverage

# CLI binary
go build -o bin/gopost ./cmd/gopost/

# Dev app (needs wails3 on PATH)
task dev
# or: wails3 dev -config ./build/config.yml -port 34115
```

Integration tests in `main_test.go` are behind `//go:build integration` — not part of default CI unit job.

## Security landmines (localhost is not safe)

Assume any browser tab / local process can hit the HTTP fallback. Before adding routes or widening features:

- No new unauthenticated shell/exec endpoints.
- Path parameters that become filesystem paths need traversal rejection (see `GitStore.safeSubPath` / `sanitizeName`).
- Import/export by arbitrary filesystem path is dangerous; prefer content-based APIs the UI already uses.
- `SetWorkspaceDir` must validate the path is a real directory.
- Terminal / PTY features: origin checks matter if enabled.
- Full audit trail (may be partially fixed since written): `plans/PRODUCTION_READINESS.md` — **re-verify in code** before acting on any item.

## How to change things safely

1. Find the package owner in the layout table; edit there first.
2. Add/adjust a focused test next to the code (`*_test.go` or `frontend/src/**/__tests__`).
3. Run the smallest relevant test command above, then broaden if you touched shared types.
4. If you change a fact in this file (ports, paths, invariants), update `AGENTS.md` in the same PR.

## Out of scope for agents unless asked

- Releasing (`scripts/release.sh`, `task release`) without an explicit release request.
- Rewriting `plans/` into a wiki or second docs system.
- Drive-by refactors of `app/app.go` size unrelated to the task.
