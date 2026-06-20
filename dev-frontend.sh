#!/bin/sh
cd "$(dirname "$0")/frontend"
exec npm run dev -- --port 34115 --strictPort
