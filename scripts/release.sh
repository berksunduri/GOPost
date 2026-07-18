#!/usr/bin/env bash
# GoPost release helper — one place for versioning, notes, tag, push, CI wait.
#
# Usage:
#   ./scripts/release.sh next                 # print next minor version (v1.x.0)
#   ./scripts/release.sh prepare [VERSION] [KEYWORDS...]
#       Create docs/releases/vX.Y.Z.md from template (edit What's New, then ship)
#   ./scripts/release.sh ship VERSION
#       Commit notes (if needed), annotated tag, push main+tag, wait for Release CI
#
# Examples:
#   ./scripts/release.sh prepare 1.10.0 "faster search, tab restore"
#   # edit docs/releases/v1.10.0.md
#   ./scripts/release.sh ship 1.10.0
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NOTES_DIR="docs/releases"
TEMPLATE="$NOTES_DIR/_TEMPLATE.md"

die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"; }

normalize_version() {
  local v="$1"
  v="${v#v}"
  [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-].*)?$ ]] || die "bad version: $1 (want X.Y.Z)"
  echo "v${v}"
}

latest_tag() {
  git tag -l 'v*.*.*' --sort=-v:refname | head -1
}

next_minor() {
  local latest major minor patch
  latest="$(latest_tag)"
  [[ -n "$latest" ]] || die "no existing v*.*.* tags"
  latest="${latest#v}"
  IFS=. read -r major minor patch <<<"$latest"
  patch="${patch%%[^0-9]*}"
  echo "v${major}.$((minor + 1)).0"
}

notes_path() {
  echo "$NOTES_DIR/$1.md"
}

title_from_notes() {
  local f="$1"
  sed -n 's/^<!-- title: \(.*\) -->$/\1/p' "$f" | head -1
}

cmd_next() {
  next_minor
}

cmd_prepare() {
  need git
  [[ -f "$TEMPLATE" ]] || die "missing $TEMPLATE"

  local version keywords notes whats
  if [[ $# -lt 1 || "$1" == "" ]]; then
    version="$(next_minor)"
  else
    version="$(normalize_version "$1")"
    shift
  fi
  keywords="${*:-TODO keywords}"
  notes="$(notes_path "$version")"

  if [[ -f "$notes" ]]; then
    die "$notes already exists — edit it or pick another version"
  fi

  whats=$(cat <<'EOF'
### ✨ Feature
Describe the headline feature in 2–4 sentences (user-facing).

### 🔧 Fixes
- Fix one
- Fix two
EOF
)

  # portable template fill (no envsubst dependency)
  python3 - "$TEMPLATE" "$notes" "$version" "$keywords" "$whats" <<'PY'
import pathlib, sys
src, dst, version, keywords, whats = sys.argv[1:6]
text = pathlib.Path(src).read_text()
text = text.replace("{{VERSION}}", version)
text = text.replace("{{KEYWORDS}}", keywords)
text = text.replace("{{WHATS_NEW}}", whats)
pathlib.Path(dst).write_text(text)
print(dst)
PY

  echo
  echo "Prepared $notes"
  echo "Title: $(title_from_notes "$notes")"
  echo
  echo "Next:"
  echo "  1. Fill What's New in $notes (keep download/security blocks)"
  echo "  2. Commit code + notes on main"
  echo "  3. ./scripts/release.sh ship ${version#v}"
}

cmd_ship() {
  need git
  need gh

  [[ $# -ge 1 ]] || die "usage: $0 ship VERSION"
  local version notes title run_id
  version="$(normalize_version "$1")"
  notes="$(notes_path "$version")"
  [[ -f "$notes" ]] || die "missing $notes — run: $0 prepare ${version#v} \"keywords\""

  title="$(title_from_notes "$notes")"
  [[ -n "$title" ]] || die "missing <!-- title: ... --> in $notes"

  if git rev-parse "$version" >/dev/null 2>&1; then
    die "tag $version already exists"
  fi

  # Ensure notes are committed
  if ! git ls-files --error-unmatch "$notes" >/dev/null 2>&1; then
    die "$notes is not tracked — git add && commit it first"
  fi
  if ! git diff --quiet HEAD -- "$notes" 2>/dev/null || ! git diff --cached --quiet -- "$notes" 2>/dev/null; then
    die "$notes has uncommitted changes — commit before shipping"
  fi

  local dirty
  dirty="$(git status --porcelain)"
  if [[ -n "$dirty" ]]; then
    die "working tree dirty — commit or stash before shipping:
$dirty"
  fi

  local branch
  branch="$(git branch --show-current)"
  [[ "$branch" == "main" ]] || die "must ship from main (on $branch)"

  # Annotated tag: short title + path pointer (full body is the notes file / GH release)
  git tag -a "$version" -m "$title

See $notes for the full GitHub release body.
"

  echo "Pushing main + $version ..."
  git push origin main
  git push origin "$version"

  echo "Waiting for Release workflow ..."
  # Find the run for this tag (may take a moment to appear)
  for _ in $(seq 1 30); do
    run_id="$(gh run list --workflow=release.yml --branch "$version" --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"
    [[ -n "$run_id" && "$run_id" != "null" ]] && break
    sleep 2
  done
  [[ -n "$run_id" && "$run_id" != "null" ]] || die "could not find Release workflow run for $version"

  gh run watch "$run_id" --exit-status

  # Re-apply notes in case of race; CI now uses body_path so this is usually a no-op
  gh release edit "$version" --title "$title" --notes-file "$notes"

  local url
  url="$(gh release view "$version" --json url -q .url)"
  echo
  echo "Shipped $version"
  echo "$url"
}

usage() {
  cat <<EOF
Usage:
  $0 next
  $0 prepare [VERSION] [KEYWORDS...]
  $0 ship VERSION

GoPost releases are always minor bumps (v1.x.0) unless you pass an explicit VERSION.
Notes file is required: docs/releases/<tag>.md
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    next) cmd_next "$@" ;;
    prepare) cmd_prepare "$@" ;;
    ship) cmd_ship "$@" ;;
    -h|--help|help|"") usage; [[ -n "$cmd" ]] || exit 1 ;;
    *) die "unknown command: $cmd (try: next | prepare | ship)" ;;
  esac
}

main "$@"
