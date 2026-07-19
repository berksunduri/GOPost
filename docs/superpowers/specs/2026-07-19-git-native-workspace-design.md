# Git-native workspace — design lock

**Date:** 2026-07-19  
**Status:** approved for implementation

## Positioning

GoPost is a **git-friendly HTTP workspace + CI runner**. Plain `.gopost.json` files are the source of truth. The desktop app and `gopost` CLI are clients of the same on-disk tree. Postman/OpenAPI import is a migration ramp, not the brand.

## Primary loop

1. Edit collections/requests/envs in a repo workspace.
2. `gopost run --data-dir . …` in CI (JUnit/JSON reporters, non-zero exit on failure).
3. Open the same folder in the desktop app to debug.

## Workspace root resolution

Order:

1. Explicit `--data-dir` / `SetWorkspaceDir` / `GOPOST_DATA_DIR`
2. Saved workspace pointer (`~/.gopost/settings/workspace.gopost.json`)
3. Default `~/.gopost`

Layout under the root:

```
collections/<id-or-slug>/
  collection.gopost.json
  requests/*.gopost.json
environments/<slug>.gopost.json
history/
settings/
runs/
```

Environments are **global** under the workspace root (collection-scoped envs are not implemented).

## Invariants

- `{{var}}` substitution at execute/send time only — never baked into saved JSON.
- Path sanitization on all user-controlled path segments.
- Secret-bearing files prefer mode `0600` / dirs `0700`.

## Phase 1 acceptance

```text
gopost run --data-dir <ws> --env <name> --reporter junit --output results.xml <collection>
# Desktop Open workspace → same <ws>
```

`<collection>` may be a directory with `collection.gopost.json`, a collections/ child dir name, or a unique manifest name.

## Non-goals

Cloud sync, team SaaS, Postman UI parity, nested folder UI, terminal re-enable.
