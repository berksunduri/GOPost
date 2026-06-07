# GoPost

**A fast, native API client and test runner — an open-source Postman alternative.**

Built with Go + Wails v3 + React. Desktop-first, Git-friendly, CI-ready.

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go" alt="Go version" />
  <img src="https://img.shields.io/badge/Wails-v3-DF0000?logo=wails" alt="Wails" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

---

## Why GoPost?

Postman is slow, Electron-bloated, and stores data in a proprietary cloud format. GoPost is:

| GoPost | Postman |
|--------|---------|
| Native binary (~15 MB) | Electron app (~500 MB) |
| Git-friendly file storage | Proprietary cloud sync |
| CLI runner built-in | Requires separate Newman npm package |
| `.http` file round-trip | Proprietary format only |
| First-class GraphQL | Basic support |
| MIT licensed, fully open-source | Freemium with paywalls |

---

## Features

### Core API Client
- **All HTTP methods** — GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, GRAPHQL
- **Headers, body, auth** — Bearer token, Basic auth, API key (header or query)
- **Environments** — `{{variable}}` substitution in URLs, headers, and body
- **Response viewer** — Pretty-printed JSON, raw body, headers, timing

### GraphQL (First-Class)
- Query editor with syntax highlighting placeholder
- Variables editor with real-time JSON validation
- **Schema introspection** — browse types, fields, and enums in a tree sidebar
- Click a field → inserts into query editor
- Response viewer splits `data` / `errors` / raw body

### `.http` File Support
- **Import** `.http` files (VS Code REST Client / IntelliJ format)
- **Export** any collection as `.http` — round-trip compatible
- **Drag & drop** `.http` files onto the window to auto-import
- **Curl paste** — paste a curl command into the URL bar to auto-fill

### Git-Friendly Storage
- Directory-per-collection with one file per request
- `collection.gopost.json` manifest + `requests/*.gopost.json` files
- Auto-generates `.gitignore` — diffable, reviewable in PRs
- Built-in Git panel: status, commit, push, pull, log

### CLI Runner (`gopost`)
```bash
# Run a collection
gopost run my-api --reporter junit --output results.xml

# Run a .http file with parallel execution
gopost run ./api.http --env production --parallel 4

# Watch mode — re-run on save (VS Code + GoPost workflow)
gopost watch ./api.http

# CI exit codes: 0 = pass, 1 = fail
gopost run my-api && echo "All passed"
```

### Reporters
- **Console** — colored box-drawing output with ✓/✗
- **JUnit XML** — GitHub Actions, GitLab CI, Jenkins
- **JSON** — machine-readable for custom pipelines

### GitHub Actions
```yaml
- uses: berksunduri/GOPost/.github/actions/run-collection@main
  with:
    collection: my-api
    environment: staging
```

---

## Screenshots

<!-- TODO: add screenshots -->
*Coming soon — dark-themed desktop app with activity bar, collection explorer, request editor, and response viewer.*

---

## Installation

### macOS
```bash
brew tap berksunduri/GOPost
brew install gopost
```

### Download Binary
Download the latest release from [GitHub Releases](https://github.com/berksunduri/GOPost/releases).

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `gopost-darwin-arm64.tar.gz` |
| macOS (Intel) | `gopost-darwin-amd64.tar.gz` |
| Linux (x86_64) | `gopost-linux-amd64.tar.gz` |
| Linux (ARM64) | `gopost-linux-arm64.tar.gz` |

### Build from Source

**Prerequisites:** Go 1.25+, Node.js 18+, npm

```bash
git clone https://github.com/berksunduri/GOPost.git
cd GOPost

# Install Wails CLI
go install github.com/wailsapp/wails/v3/cmd/wails@latest

# Install frontend dependencies
cd frontend && npm install && cd ..

# Development (hot reload)
wails dev

# Build desktop app
wails build

# Build CLI only
go build -ldflags "-X main.version=$(git describe --tags --always)" -o bin/gopost ./cmd/gopost/
```

---

## Project Structure

```
GOPost/
├── main.go                          # Wails v3 entry point
├── wails.json                       # Wails configuration
├── go.mod                           # Go module
├── app/
│   ├── app.go                       # All Go→React method bindings
│   ├── features.go                  # Feature flags
│   └── pkg/
│       ├── models/models.go         # Data models (Collection, Request, GraphQLPayload...)
│       ├── storage/gitstore.go      # Git-friendly file storage
│       ├── gitops/gitops.go         # Git operations (status, commit, push, pull)
│       ├── parser/httpfile.go       # .http file parser + generator
│       └── runner/
│           ├── runner.go            # CLI collection runner (sequential + parallel)
│           └── reporters/
│               ├── console.go       # Pretty terminal output
│               ├── junit.go         # JUnit XML reporter
│               └── json.go          # JSON reporter
├── cmd/
│   └── gopost/main.go              # CLI entry point (run, watch)
├── frontend/
│   └── src/
│       ├── App.jsx                  # Main app with drag-drop support
│       ├── api.js                   # HTTP API + Wails bridge
│       ├── bridge.js                # Wails service discovery
│       ├── context/AppContext.jsx    # Global state management
│       └── components/
│           ├── RequestEditor.jsx    # URL bar, method selector, headers, body
│           ├── Collections.jsx      # Collection tree + .http import/export
│           ├── EnvironmentManager.jsx
│           ├── HistoryPanel.jsx
│           ├── GitPanel.jsx
│           ├── TerminalPanel.jsx    # Embedded PTY terminal
│           └── ui/                  # shadcn/ui-based component library
├── build/                           # Taskfile build system
│   ├── config.yml
│   ├── darwin/Taskfile.yml
│   ├── linux/Taskfile.yml
│   └── windows/Taskfile.yml
└── .github/
    ├── actions/run-collection/      # GitHub Action
    └── homebrew/gopost.rb           # Homebrew formula
```

---

## Development

```bash
# Install Wails
go install github.com/wailsapp/wails/v3/cmd/wails@latest

# Dev mode with hot reload
wails dev

# Run tests
go test ./...

# Build CLI
task build:cli        # or: go build -o bin/gopost ./cmd/gopost/

# Build all (GUI + CLI)
task build:all
```

---

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 0 — Foundation | ✅ Done | Wails + React + Go architecture |
| 1 — Git Storage | ✅ Done | Directory-per-collection, one-file-per-request |
| 2 — CLI Runner | ✅ Done | `gopost run`, JUnit/JSON reporters, parallel execution |
| 3 — `.http` & Curl | ✅ Done | Parser, generator, import, export, drag-drop, watch mode |
| 4 — GraphQL | ✅ Done | Schema introspection, query editor, variables, response viewing |
| 5 — WebSocket & SSE | 🔲 Planned | First-class WS/SSE request types |
| 6 — Scripting | 🔲 Planned | Starlark pre-request + test scripts |
| 7 — Polish | 🔲 Planned | Performance, auto-save, undo/redo, keyboard shortcuts |
| 8 — Distribution | 🔄 In Progress | Homebrew, GitHub Releases, Chocolatey |

---

## Code Signing (optional)

To eliminate OS security warnings (Gatekeeper on macOS, SmartScreen on Windows),
add these secrets to your GitHub repo:

### macOS (Apple Developer ID + Notarization)

Requires an Apple Developer account ($99/year):

| Secret | Description |
|--------|-------------|
| `APPLE_DEVELOPER_CERT` | Base64 of your Developer ID Application .p12 certificate |
| `APPLE_CERT_PASSWORD` | Password for the .p12 certificate |
| `APPLE_TEAM_ID` | Your Apple Developer Team ID (10 chars) |
| `APPLE_NOTARY_APPLE_ID` | Apple ID email for notarization |
| `APPLE_NOTARY_PASSWORD` | App-specific password for notarization |

```bash
# Encode your cert for GitHub Secrets
base64 -i developer_id.p12 | pbcopy
```

### Windows (Authenticode)

Requires an EV or OV code signing certificate (~$200-400/year from DigiCert, Sectigo):

| Secret | Description |
|--------|-------------|
| `WINDOWS_SIGNING_CERT` | Base64 of your .pfx code signing certificate |
| `WINDOWS_SIGNING_PASSWORD` | Password for the .pfx certificate |

### Without signing

Until the app is notarized, macOS shows a security warning. This is normal
for open-source apps — even VLC and Firefox direct downloads show it.

**One-time bypass (choose either):**

**Option A — Right-click:** Right-click `GoPost.app` in Finder → **Open** → click **Open**.

**Option B — System Settings:** Go to **System Settings → Privacy & Security**, scroll
to the bottom, click **Open Anyway** next to "GoPost was blocked."

**Windows:** Right-click `GoPost.exe` → Properties → **Unblock**, then run.

---

## Contributing

GoPost is MIT-licensed and welcomes contributions!

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-thing`)
3. Make your changes
4. Run tests (`go test ./...`)
5. Open a PR against `main`

See [`plans/IMPLEMENTATION_ROADMAP.md`](plans/IMPLEMENTATION_ROADMAP.md) for the full technical plan.

---

## License

MIT © [Berk Sunduri](https://github.com/berksunduri)
