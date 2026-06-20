#!/bin/sh
# Start GoPost with hot reload for both frontend and backend.
# - Frontend: Vite HMR (instant, no restart)
# - Backend:  auto-rebuilds on .go file changes
cd "$(dirname "$0")"
exec wails3 dev -port 34115
