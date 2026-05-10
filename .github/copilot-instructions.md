# GoPost - Postman Clone with Go + Wails React

## Project Overview
GoPost is an educational Postman clone with both a simple web version and a modern Wails desktop application. It features a REST API backend, file-based storage, and web/desktop frontends for managing HTTP requests, collections, environments, and request history.

### Architecture
- **Backend**: Go with net/http (web) or Wails framework (desktop)
- **Frontend**: Vanilla JavaScript (web) or React with Vite (Wails)
- **Database**: JSON files in `data/` (web) or `~/.gopost/` (Wails)
- **UI**: Dark-themed, modern interface

## Project Setup Checklist
- [x] Project requirements clarified
- [x] Go project structure scaffolded  
- [x] Wails + React integration added
- [x] Go bindings created for frontend
- [x] React components implemented
- [x] Storage layer refactored
- [x] Documentation completed

## Development Commands

### Simple Web Version
- Build: `go build -o gopost .`
- Run: `./gopost` or `go run main.go`
- Test: `go test ./...`

### Wails Desktop Version  
- Install Wails: `go install github.com/wailsapp/wails/v3/cmd/wails@latest`
- Install deps: `cd frontend && npm install && cd ..`
- Dev mode: `wails dev` (with hot reload)
- Build: `wails build` (creates standalone executable)
- Test: `go test ./...`

## Key Features Implemented
1. ✅ Collections and folders management
2. ✅ HTTP request builder with method, headers, body
3. ✅ Environments with variables
4. ✅ Request history and execution
5. ✅ Response viewer with formatting
6. ✅ Go-React Wails bindings
7. ✅ File-based persistence

## Project Structure
```
GoPost/
├── app/                              # Wails app logic
│   ├── app.go                       # App struct with method bindings
│   └── pkg/
│       ├── models/models.go         # Data models
│       └── storage/storage.go       # Persistence
├── frontend/                         # React UI
│   ├── src/components/              # React components
│   ├── src/App.jsx                  # Main app
│   ├── package.json & vite.config.js
├── main.go                           # Wails entry point
├── go.mod                            # Dependencies
├── wails.json                        # Wails config
├── pkg/                              # Original web version code
├── data/                             # Web version storage
└── README/WAILS_SETUP docs
```

## Learning Outcomes
- Go fundamentals: structs, methods, interfaces, concurrency
- Wails framework: app lifecycle, method bindings, asset embedding
- React: components, hooks, state management
- REST API: design patterns, HTTP clients
- Desktop app development: cross-platform builds
- Full-stack web development patterns

## Running the Project

### Quick Start (Web Version)
```bash
cd /mnt/windows-d/CODE/GO/GoPost
go build -o gopost .
./gopost
# Open browser to http://localhost:<port>
```

### Production (Wails Desktop)
```bash
cd /mnt/windows-d/CODE/GO/GoPost
go install github.com/wailsapp/wails/v3/cmd/wails@latest
export PATH=$PATH:$(go env GOPATH)/bin
cd frontend && npm install && cd ..
wails dev              # development
wails build            # production binary
```

## Next Steps
1. Review WAILS_SETUP.md for detailed Wails configuration
2. Extend Go methods in `app/app.go` for new features
3. Add React components in `frontend/src/components/`
4. Build and distribute the application
5. Consider adding: authentication, request templates, test automation

