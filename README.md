# GoPost

Git-friendly HTTP workspace and CI runner. Desktop app + CLI. Plain `.gopost.json` files on disk — no accounts, no cloud.

Built with Go, Wails, and React.

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go" alt="Go version" />
  <img src="https://img.shields.io/badge/Wails-v3-DF0000?logo=wails" alt="Wails" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

---

## What it is

Keep HTTP collections next to your code. Edit them in the desktop app or any editor, commit them, and run them in CI with `gopost run`.

```text
repo/
  collections/checkout-api/
    collection.gopost.json
    requests/*.gopost.json
  environments/ci.gopost.json
```

```bash
gopost run --data-dir . --env ci --reporter junit --output results.xml checkout-api
```

Open the same folder in the desktop app (Settings → Workspace) to debug.

## Features

- Send HTTP requests (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, GraphQL)
- Headers, body, auth (Bearer, Basic, API key)
- Environments with `{{variable}}` substitution at send/run time
- Response viewer with JSON formatting, syntax highlighting, and inline search
- Generate equivalent code in cURL, fetch, axios, Go, Python, or HTTPie
- Import Postman Collection v2.1, OpenAPI/Swagger, and `.http` files (migration aids)
- Theme switching + custom color editor
- GraphQL: query editor, variables, schema introspection
- WebSocket and SSE support
- Starlark pre-request and test scripts (desktop and CLI runner)
- Collection runner with JUnit and JSON reporters
- Keyboard shortcuts (rebindable in Settings)

## Storage

Requests and collections are plain `.gopost.json` files. Point the app or CLI at a workspace root via:

1. `--data-dir` / Settings → Open workspace
2. `GOPOST_DATA_DIR`
3. Last opened workspace
4. Default `~/.gopost`

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
gopost run --data-dir . --env ci checkout-api
gopost run --data-dir . ./collections/checkout-api
gopost run --env-file ./secrets.gopost.json ./api.http --parallel 4
gopost run --data-dir . --reporter junit --output results.xml my-api
```

### GitHub Action

```yaml
- uses: berksunduri/GoPost/.github/actions/run-collection@main
  with:
    collection: checkout-api
    data_dir: .
    environment: ci
```

## Contributing

MIT licensed. PRs welcome. Coding agents: start at [`AGENTS.md`](./AGENTS.md).

1. Fork it
2. Branch it
3. `go test ./...`
4. PR against main

## License

MIT
