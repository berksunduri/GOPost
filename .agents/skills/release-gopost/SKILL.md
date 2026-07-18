---
name: release-gopost
description: >-
  Ship a GoPost GitHub release (notes, tag, push, CI assets) using the repo's
  established v1.x.0 pattern. Use when the user asks to release, cut a version,
  tag, publish release notes, or run scripts/release.sh.
---

# Release GoPost

## Rule

Do **not** improvise the release process. Use `scripts/release.sh` + `docs/releases/`.

## Versioning

- Tags are `vMAJOR.MINOR.PATCH` (historically always `v1.x.0` minor bumps).
- Next version: `./scripts/release.sh next`
- Release title: `vX.Y.Z — short, comma-separated keywords` (match prior releases).

## Checklist

Copy and track:

```
Release Progress:
- [ ] Diff since last tag understood (commits + uncommitted work)
- [ ] Notes drafted at docs/releases/vX.Y.Z.md
- [ ] Code + notes committed on main
- [ ] Tests: go test ./app/pkg/... -race && (cd frontend && npm test)
- [ ] ./scripts/release.sh ship X.Y.Z
- [ ] Release URL returned; assets present
```

## Steps

### 1. Decide version + keywords

```bash
./scripts/release.sh next
```

Title keywords = 3–6 user-facing phrases (e.g. `send without save, scratch requests, virtualized responses`).

### 2. Draft notes

```bash
./scripts/release.sh prepare 1.10.0 "keyword one, keyword two"
```

Edit `docs/releases/vX.Y.Z.md`:

- Keep the download tables, macOS/Windows warnings, brew/choco, checksums footer.
- Replace the What's New section with emoji `###` subsections + short prose (see `docs/releases/v1.9.0.md` / `v1.8.0` GH release).
- Keep the first line: `<!-- title: vX.Y.Z — keywords -->`

Do **not** invent a new notes layout.

### 3. Commit on `main`

Commit message style (match history):

```
v1.10.0 — keyword one, keyword two

- Bullet of user-facing change
- Bullet of user-facing change
- Fix: …
```

Include `docs/releases/vX.Y.Z.md` in the same commit (or an immediately prior commit on main).

### 4. Ship

Working tree must be clean; branch must be `main`:

```bash
./scripts/release.sh ship 1.10.0
```

This tags, pushes `main` + tag, waits for `.github/workflows/release.yml`, and sets the GH release title/body from the notes file.

CI builds macOS dmg, Windows exe, CLI archives, checksums, and attaches them. Notes come from `body_path: docs/releases/<tag>.md` — do not hand-paste boilerplate into the workflow.

### 5. Verify

```bash
gh release view vX.Y.Z --json url,name,assets --jq '{url,name,assets:[.assets[].name]}'
```

Expect ~8 assets including `GoPost-v*-macOS.dmg`, `GoPost.exe`, CLI tarballs/zip, `checksums.txt`.

## Notes shape (required)

Mirror `docs/releases/_TEMPLATE.md` and the latest `docs/releases/v*.md`:

1. HTML comment title
2. `## GoPost vX.Y.Z`
3. Desktop download table + security callouts
4. CLI download table
5. Package managers
6. Collapsed `<details>` What's New with emoji section headers
7. Checksums footer

## Out of scope / do not

- Do not create patch tags unless the user explicitly asks for `vX.Y.Z` with Z≠0.
- Do not push `--force` tags.
- Do not skip the notes file (CI fails without it).
- Do not put secrets in notes.
- Dev caveats (embed `frontend/dist`, `wails3 dev`, local testserver) belong in contributor docs, not release notes, unless they are user-facing fixes.

## Related

- Workflow: `.github/workflows/release.yml`
- Script: `scripts/release.sh`
- Prior notes: `docs/releases/`
- Task shortcut: `task release -- prepare …` / `task release -- ship …`
