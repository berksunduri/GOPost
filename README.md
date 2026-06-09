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
- **Response viewer** — Pretty-printed JSON, raw body, search (Ctrl+F), copy to clipboard

### GraphQL (First-Class)
- Query editor with syntax highlighting placeholder
- Variables editor with real-time JSON validation
- **Schema introspection** — browse types, fields, and enums in a tree sidebar
- Click a field → inserts into query editor
- Response viewer splits `data` / `errors` / raw body

### WebSocket & SSE (First-Class)
- **WebSocket** — connect to any WS/WSS endpoint, send messages, view log with timestamps
- **SSE** — subscribe to Server-Sent Events streams with live auto-scroll
- Connection status indicator (green/yellow/red dot with ping animation)
- Message/event log persists across tab switches
- Save WS/SSE connections as collection requests

### Starlark Scripting Engine
- **Pre-request scripts** — modify headers, body, URL dynamically before sending
- **Test scripts** — assert status codes, headers, JSON paths, response time, body content
- Built-in modules: `json`, `base64`, `hmac`, `uuid`, `now`, `assert` (6 assertion functions)
- 5-second timeout prevents infinite loops
- Environment variable chaining between requests
- Syntax-highlighted script editor with line numbers

### `.http` File Support
- **Import** `.http` files (VS Code REST Client / IntelliJ format)
- **Export** any collection as `.http` — round-trip compatible
- **Drag & drop** `.http` files onto the window to auto-import
- **Curl paste** — paste a curl command into the URL bar to auto-fill

### Git-Friendly Storage
- Directory-per-collection with one file per request
- `collection.gopost.json` manifest + `requests/*.gopost.json` files
- Auto-generates `.gitignore` — diffable, reviewable in PRs
- Built-in Git panel: view all collections, init, commit, push, pull, log

### UX & Performance
- **Resizable sidebar** — drag the right edge (200-500px)
- **Tab management** — horizontal scroll, Ctrl+Tab cycling, persistence across restarts
- **Auto-save** — saves after 2s of inactivity with visual dirty/saved indicators
- **Keyboard shortcuts** — `?` to see all, Ctrl+N/W/Tab, Ctrl+Enter to send, Ctrl+F to search
- **Request duplication** — right-click any request to copy it
- **Variable preview** — hover `{{VARIABLES}}` to see resolved values inline
- **Drag & drop** — drop `.http` files anywhere on the window

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

## Installation

### macOS
```bash
brew tap berksunduri/GOPost
brew install gopost
```

### Windows
```powershell
choco install gopost
```

### Download Binary
Download the latest release from [GitHub Releases](https://github.com/berksunduri/GOPost/releases).

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `gopost-darwin-arm64.tar.gz` |
| macOS (Intel) | `gopost-darwin-amd64.tar.gz` |
| Linux (x86_64) | `gopost-linux-amd64.tar.gz` |
| Linux (ARM64) | `gopost-linux-arm64.tar.gz` |
| Windows (x86_64) | `gopost-windows-amd64.zip` |

### Build from Source

**Prerequisites:** Go 1.25+, Node.js 18+, npm

```bash
git clone https://github.com/berksunduri/GOPost.git
cd GOPost
cd frontend && npm install && cd ..

# Development (hot reload)
wails dev

# Build desktop app
wails build

# Build CLI only
go build -ldflags "-X main.version=$(git describe --tags --always)" -o bin/gopost ./cmd/gopost/
```

---

## Contributing

GoPost is MIT-licensed and welcomes contributions!

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-thing`)
3. Make your changes
4. Run tests (`go test ./...`)
5. Open a PR against `main`

---

## License

MIT © [Berk Sunduri](https://github.com/berksunduri)
