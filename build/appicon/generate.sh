#!/bin/bash
# Generate app icons from SVG for all platforms.
# Requires: rsvg-convert (brew install librsvg) or sips + iconutil (macOS built-in).

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SVG="$SCRIPT_DIR/icon.svg"

echo "Generating app icons from $SVG ..."

# ── macOS (.icns) ──
if command -v rsvg-convert &>/dev/null; then
  mkdir -p "$PROJECT_DIR/build/darwin"
  ICONSET="$PROJECT_DIR/build/darwin/icon.iconset"
  mkdir -p "$ICONSET"

  for size in 16 32 64 128 256 512; do
    rsvg-convert -w $size -h $size "$SVG" -o "$ICONSET/icon_${size}x${size}.png"
    rsvg-convert -w $((size*2)) -h $((size*2)) "$SVG" -o "$ICONSET/icon_${size}x${size}@2x.png"
  done
  rsvg-convert -w 1024 -h 1024 "$SVG" -o "$ICONSET/icon_512x512@2x.png"

  iconutil -c icns "$ICONSET" -o "$PROJECT_DIR/build/darwin/icon.icns"
  rm -rf "$ICONSET"
  echo "  ✓ macOS: build/darwin/icon.icns"
elif command -v sips &>/dev/null && command -v iconutil &>/dev/null; then
  echo "  ⚠ rsvg-convert not found — install with: brew install librsvg"
  echo "  ⚠ Skipping macOS icon (sips can't convert SVG)"
else
  echo "  ⚠ No SVG converter found — skipping macOS icon"
fi

# ── Windows (.ico) ──
if command -v rsvg-convert &>/dev/null; then
  mkdir -p "$PROJECT_DIR/build/windows"
  # Generate a multi-resolution ICO
  rsvg-convert -w 256 -h 256 "$SVG" -o /tmp/gopost-256.png
  rsvg-convert -w 64 -h 64 "$SVG" -o /tmp/gopost-64.png
  rsvg-convert -w 48 -h 48 "$SVG" -o /tmp/gopost-48.png
  rsvg-convert -w 32 -h 32 "$SVG" -o /tmp/gopost-32.png
  rsvg-convert -w 16 -h 16 "$SVG" -o /tmp/gopost-16.png

  if command -v convert &>/dev/null; then
    convert /tmp/gopost-256.png /tmp/gopost-64.png /tmp/gopost-48.png \
            /tmp/gopost-32.png /tmp/gopost-16.png \
            "$PROJECT_DIR/build/windows/icon.ico"
    rm -f /tmp/gopost-*.png
    echo "  ✓ Windows: build/windows/icon.ico"
  elif command -v magick &>/dev/null; then
    magick /tmp/gopost-256.png /tmp/gopost-64.png /tmp/gopost-48.png \
           /tmp/gopost-32.png /tmp/gopost-16.png \
           "$PROJECT_DIR/build/windows/icon.ico"
    rm -f /tmp/gopost-*.png
    echo "  ✓ Windows: build/windows/icon.ico"
  else
    # Fallback: just use the 256px PNG
    cp /tmp/gopost-256.png "$PROJECT_DIR/build/windows/icon.png"
    rm -f /tmp/gopost-*.png
    echo "  ⚠ ImageMagick not found — using PNG fallback for Windows"
  fi
elif command -v magick &>/dev/null; then
  mkdir -p "$PROJECT_DIR/build/windows"
  magick -background none -density 1024 "$SVG" \
         -resize 256x256 "$PROJECT_DIR/build/windows/icon.ico"
  echo "  ✓ Windows: build/windows/icon.ico"
else
  echo "  ⚠ No converter found — skipping Windows icon"
fi

# ── Linux (.png) ──
if command -v rsvg-convert &>/dev/null; then
  mkdir -p "$PROJECT_DIR/build/linux"
  rsvg-convert -w 256 -h 256 "$SVG" -o "$PROJECT_DIR/build/linux/icon.png"
  echo "  ✓ Linux: build/linux/icon.png"
elif command -v magick &>/dev/null; then
  mkdir -p "$PROJECT_DIR/build/linux"
  magick -background none -density 1024 "$SVG" \
         -resize 256x256 "$PROJECT_DIR/build/linux/icon.png"
  echo "  ✓ Linux: build/linux/icon.png"
else
  echo "  ⚠ No converter found — skipping Linux icon"
fi

echo "Done."
