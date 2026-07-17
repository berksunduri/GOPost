# AGENTS.md

## Cursor Cloud specific instructions

GoPost is a single Wails v3 desktop API client: a Go backend compiled into a
native binary with an embedded React/Vite frontend rendered in a WebKitGTK
webview. There is no server backend and no database — data is stored as
`.gopost.json` files under `~/.gopost`. A companion CLI (`cmd/gopost`) and two
local mock servers (`cmd/testserver`, `cmd/graphql-mock`) live in the same repo.

Standard commands are documented in `README.md`, `Taskfile.yml`,
`build/Taskfile.yml`, `frontend/package.json`, and `.github/workflows/ci.yml`.
The dependency-refresh update script already runs `npm install` (in `frontend/`)
and `go mod download` on startup. Go tooling (`wails3`, `task`, `golangci-lint`),
the WebKitGTK/GTK dev libraries, and the `$(go env GOPATH)/bin` PATH entry are
baked into the VM snapshot — do not reinstall them.

Non-obvious caveats:

- **Build the frontend before building/linting the Go app.** `main.go` uses
  `//go:embed all:frontend/dist`, so `go build .` and `golangci-lint run` fail
  with a "no matching files found" typecheck error until `dist/` exists. Run
  `npm run build` in `frontend/` first (dev mode via `wails3 dev` handles this
  itself).
- **`task build` / `task build:all` are broken** with the installed go-task
  version (`wrong number of args for exeExt`). Build binaries directly instead:
  `go build -o bin/GoPost .` (GUI) and
  `go build -ldflags="-X main.version=1.0.0-dev" -o bin/gopost ./cmd/gopost/` (CLI).
- **Run the GUI in dev mode** with `wails3 dev -config ./build/config.yml -port 34115`.
  In the headless VM export `DISPLAY=:1` and, for reliable WebKit rendering,
  `WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1`.
- **Tests:** CI-equivalent commands are `go test ./app/pkg/... -race` and, in
  `frontend/`, `npm test`. The root and `app/` packages require CGO + the
  webview and are integration-only; all business logic tests live in `app/pkg/...`.
- **`golangci-lint run` reports many pre-existing findings and is NOT part of CI.**
  Treat a nonzero exit as the repo baseline, not a regression you introduced.
- **No outbound internet.** `test-api.http` targets `httpbin.org` and will fail.
  For end-to-end request testing use the bundled `go run ./cmd/testserver`
  (HTTP/WS/SSE on port 9876; `GET /health` returns 200 JSON) or
  `go run ./cmd/graphql-mock` (port 4567) as local targets.
- **CLI runner:** `./bin/gopost run <file.http>` sends real HTTP requests;
  a request passes on 2xx/3xx, and an `X-Expected-Status: <code>` header adds a
  status assertion.
