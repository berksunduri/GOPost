# GoPost

An API client for people who think Postman is too much. Desktop app, plain files, works offline.

Built with Go, Wails, and React. Data is stored as JSON files on disk — no accounts, no cloud, nothing to sync.

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go" alt="Go version" />
  <img src="https://img.shields.io/badge/Wails-v3-DF0000?logo=wails" alt="Wails" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

---

## Features

- Send HTTP requests (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, GraphQL)
- Headers, body, auth (Bearer, Basic, API key)
- Environments with `{{variable}}` substitution
- Response viewer with JSON formatting, syntax highlighting, and inline search
- Generate equivalent code in cURL, fetch, axios, Go, Python, or HTTPie (toolbar dropdown)
- Postman import — drag a Postman Collection v2.1 JSON export; folders flattened, auth extracted
- OpenAPI / Swagger import — drag an OpenAPI 3.x or Swagger 2.0 JSON spec; all endpoints imported
- Theme switching (dark, light, high contrast, dracula, fleafy) + custom color editor
- GraphQL: query editor, variables, schema introspection
- WebSocket and SSE support
- Starlark scripting — pre-request and test scripts
- Import/export `.http` files (curl paste too)
- Collection runner with JUnit and JSON reporters (CI-friendly)
- Keyboard shortcuts (rebindable in Settings)

## Storage

Requests and collections are plain `.gopost.json` files in a directory structure you can check into Git. No database, no cloud dependency.

## Install

Download the binary from [releases](https://github.com/berksunduri/GoPost/releases), or build from source:

```bash
git clone https://github.com/berksunduri/GoPost.git
cd GoPost/frontend && npm install && cd ..
wails build
```

CLI runner:

```bash
go build -o bin/gopost ./cmd/gopost/
```

## CLI

```bash
gopost run my-collection
gopost run ./api.http --env production --parallel 4
gopost run my-api --reporter junit --output results.xml
```

## Contributing

MIT licensed. PRs welcome.

1. Fork it
2. Branch it
3. `go test ./...`
4. PR against main

## License

MIT
