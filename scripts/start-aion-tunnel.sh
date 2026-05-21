#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLOUDFLARED=""
for cmd in cloudflared cloudflared.exe "$SCRIPT_DIR/cloudflared" "$SCRIPT_DIR/cloudflared.exe"; do
  if command -v "$cmd" &>/dev/null || [ -f "$cmd" ]; then
    CLOUDFLARED="$cmd"
    break
  fi
done
if [ -z "$CLOUDFLARED" ]; then
  echo "[ERROR] cloudflared not found."
  echo ""
  echo "Install it:"
  echo "  Windows: scoop install cloudflared"
  echo "  macOS:   brew install cloudflared"
  echo "  Linux:   sudo apt install cloudflared"
  echo ""
  echo "Or download to scripts/:"
  echo "  curl -L -o scripts/cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  echo ""
  exit 1
fi
echo "[INFO] Starting cloudflared tunnel to http://127.0.0.1:8000"
echo "[INFO] Wait for a URL like https://xxxx.trycloudflare.com"
echo ""
exec "$CLOUDFLARED" tunnel --url http://127.0.0.1:8000
