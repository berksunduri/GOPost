#!/bin/bash
# Generate app icons from SVG for all platforms.
# macOS: uses built-in sips + iconutil (no extra deps needed).
# Linux: uses rsvg-convert.
# Windows: uses rsvg-convert + ImageMagick (or sips on macOS cross-build).

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SVG="$SCRIPT_DIR/icon.svg"

echo "Generating app icons from $SVG ..."

# ── macOS (.icns) using sips (built-in, macOS 13+) ──
if [[ "$(uname)" == "Darwin" ]] && command -v sips &>/dev/null && command -v iconutil &>/dev/null; then
  mkdir -p "$PROJECT_DIR/build/darwin"
  ICONSET="$PROJECT_DIR/build/darwin/icon.iconset"
  mkdir -p "$ICONSET"

  # sips can convert SVG directly on macOS 13+
  sips -s format png -z 16   16   "$SVG" --out "$ICONSET/icon_16x16.png"         2>/dev/null || true
  sips -s format png -z 32   32   "$SVG" --out "$ICONSET/icon_16x16@2x.png"      2>/dev/null || true
  sips -s format png -z 32   32   "$SVG" --out "$ICONSET/icon_32x32.png"         2>/dev/null || true
  sips -s format png -z 64   64   "$SVG" --out "$ICONSET/icon_32x32@2x.png"      2>/dev/null || true
  sips -s format png -z 128  128  "$SVG" --out "$ICONSET/icon_128x128.png"       2>/dev/null || true
  sips -s format png -z 256  256  "$SVG" --out "$ICONSET/icon_128x128@2x.png"    2>/dev/null || true
  sips -s format png -z 256  256  "$SVG" --out "$ICONSET/icon_256x256.png"       2>/dev/null || true
  sips -s format png -z 512  512  "$SVG" --out "$ICONSET/icon_256x256@2x.png"    2>/dev/null || true
  sips -s format png -z 512  512  "$SVG" --out "$ICONSET/icon_512x512.png"       2>/dev/null || true
  sips -s format png -z 1024 1024 "$SVG" --out "$ICONSET/icon_512x512@2x.png"    2>/dev/null || true

  # If sips failed on SVG, try rsvg-convert fallback
  if [ ! -f "$ICONSET/icon_16x16.png" ]; then
    echo "  sips SVG conversion failed, trying rsvg-convert..."
    if command -v rsvg-convert &>/dev/null; then
      rm -f "$ICONSET"/*.png
      for size in 16 32 64 128 256 512; do
        rsvg-convert -w $size -h $size "$SVG" -o "$ICONSET/icon_${size}x${size}.png"
        rsvg-convert -w $((size*2)) -h $((size*2)) "$SVG" -o "$ICONSET/icon_${size}x${size}@2x.png"
      done
      rsvg-convert -w 1024 -h 1024 "$SVG" -o "$ICONSET/icon_512x512@2x.png"
    else
      echo "  ERROR: no SVG converter available. Install librsvg: brew install librsvg"
      exit 1
    fi
  fi

  iconutil -c icns "$ICONSET" -o "$PROJECT_DIR/build/darwin/icon.icns"
  rm -rf "$ICONSET"
  echo "  ✓ macOS: build/darwin/icon.icns"
else
  echo "  ⚠ Not on macOS — skipping .icns generation"
fi

# ── Windows (.ico) ──
mkdir -p "$PROJECT_DIR/build/windows"

make_ico() {
  local cmd=$1
  if [ "$cmd" = "sips" ]; then
    sips -s format png -z 256 256 "$SVG" --out /tmp/gopost-256.png 2>/dev/null || return 1
    sips -s format png -z 64  64  "$SVG" --out /tmp/gopost-64.png  2>/dev/null || return 1
    sips -s format png -z 48  48  "$SVG" --out /tmp/gopost-48.png  2>/dev/null || return 1
    sips -s format png -z 32  32  "$SVG" --out /tmp/gopost-32.png  2>/dev/null || return 1
    sips -s format png -z 16  16  "$SVG" --out /tmp/gopost-16.png  2>/dev/null || return 1
  else
    rsvg-convert -w 256 -h 256 "$SVG" -o /tmp/gopost-256.png || return 1
    rsvg-convert -w 64  -h 64  "$SVG" -o /tmp/gopost-64.png  || return 1
    rsvg-convert -w 48  -h 48  "$SVG" -o /tmp/gopost-48.png  || return 1
    rsvg-convert -w 32  -h 32  "$SVG" -o /tmp/gopost-32.png  || return 1
    rsvg-convert -w 16  -h 16  "$SVG" -o /tmp/gopost-16.png  || return 1
  fi

  # Merge into .ico
  if command -v convert &>/dev/null; then
    convert /tmp/gopost-*.png "$PROJECT_DIR/build/windows/icon.ico"
  elif command -v magick &>/dev/null; then
    magick /tmp/gopost-*.png "$PROJECT_DIR/build/windows/icon.ico"
  elif command -v sips &>/dev/null; then
    # No ImageMagick — just use 256px PNG as fallback
    cp /tmp/gopost-256.png "$PROJECT_DIR/build/windows/icon.png"
    echo "  ⚠ ImageMagick not found — using PNG fallback for Windows icon"
  fi
  rm -f /tmp/gopost-*.png
  return 0
}

if command -v rsvg-convert &>/dev/null; then
  make_ico "rsvg" && echo "  ✓ Windows: build/windows/icon.ico"
elif [[ "$(uname)" == "Darwin" ]] && command -v sips &>/dev/null; then
  make_ico "sips" && echo "  ✓ Windows: build/windows/icon.ico"
else
  echo "  ⚠ No converter found — skipping Windows icon"
fi

# ── Linux (.png) ──
mkdir -p "$PROJECT_DIR/build/linux"
if command -v rsvg-convert &>/dev/null; then
  rsvg-convert -w 256 -h 256 "$SVG" -o "$PROJECT_DIR/build/linux/icon.png"
  echo "  ✓ Linux: build/linux/icon.png"
elif [[ "$(uname)" == "Darwin" ]] && command -v sips &>/dev/null; then
  sips -s format png -z 256 256 "$SVG" --out "$PROJECT_DIR/build/linux/icon.png" 2>/dev/null && \
    echo "  ✓ Linux: build/linux/icon.png" || echo "  ⚠ sips failed"
else
  echo "  ⚠ No converter found — skipping Linux icon"
fi

echo "Done."
