#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
TARGET_ROOT="${TARGET_ROOT:-/var/www/incubator}"
TARGET_DIST="$TARGET_ROOT/dist"
CADDYFILE_SRC="$PROJECT_ROOT/deploy/caddy/Caddyfile"
CADDYFILE_TARGET="/etc/caddy/Caddyfile"
SITE_DOMAIN="${SITE_DOMAIN:-t3.test2dapp.xyz}"

cd "$PROJECT_ROOT"

if [[ ! -d "$DIST_DIR" ]]; then
  echo "dist not found, running build:web"
  npm run build:web
fi

if [[ ! -f "$CADDYFILE_SRC" ]]; then
  echo "Missing $CADDYFILE_SRC"
  exit 1
fi

echo "==> Preparing target directory: $TARGET_DIST"
sudo mkdir -p "$TARGET_DIST"

echo "==> Syncing dist to $TARGET_DIST"
sudo rsync -av --delete "$DIST_DIR/" "$TARGET_DIST/"

echo "==> Installing Caddyfile"
sudo cp "$CADDYFILE_SRC" "$CADDYFILE_TARGET"
sudo sed -i "s|__SITE_DOMAIN__|$SITE_DOMAIN|g" "$CADDYFILE_TARGET"

echo "==> Validating Caddy config"
sudo caddy validate --config "$CADDYFILE_TARGET"

echo "==> Restarting Caddy"
sudo systemctl restart caddy
sudo systemctl is-active --quiet caddy

echo "==> Deployment via Caddy completed"
