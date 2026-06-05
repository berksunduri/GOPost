#!/bin/sh
# Start GoPost with hot reload for both frontend and backend.
# - Frontend: Vite HMR (instant, no restart)
# - Backend:  auto-rebuilds on .go file changes
exec /Users/berksunduri/go/bin/wails3 dev -port 34115
