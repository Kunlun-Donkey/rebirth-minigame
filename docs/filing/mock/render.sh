#!/usr/bin/env bash
# 把 mock/*.html 渲染为 1080×1920 截图，输出到 ../screenshots/
# 用法：bash docs/filing/mock/render.sh [文件名前缀，如 1-event]
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/../screenshots"
mkdir -p "$OUT"
for f in "$DIR"/${1:-*}.html; do
  name="$(basename "$f" .html)"
  google-chrome --headless=old --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size=540,960 \
    --screenshot="$OUT/$name.png" "file://$f" >/dev/null 2>&1
  echo "$OUT/$name.png"
done
