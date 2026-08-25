#!/bin/sh
set -eu

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
DIR="$(cd "$(dirname "$0")" && pwd)"

"$CHROME" \
  --headless \
  --disable-gpu \
  --hide-scrollbars \
  --window-size=1200,630 \
  --force-device-scale-factor=1 \
  --virtual-time-budget=10000 \
  --screenshot="$DIR/../public/og.png" \
  "file://$DIR/og-image.html"
