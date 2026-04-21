#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
TARGET_ROOT="${TARGET_ROOT:-/var/www/incubator}"
TARGET_DIST="$TARGET_ROOT/dist"
CADDYFILE_SRC="$PROJECT_ROOT/deploy/caddy/Caddyfile"
CADDYFILE_TARGET="/etc/caddy/Caddyfile"
SITE_DOMAINS="${SITE_DOMAINS:-t1.test2dapp.xyz,t2.test2dapp.xyz,t3.test2dapp.xyz}"

cd "$PROJECT_ROOT"

if [[ ! -d "$DIST_DIR" ]]; then
  echo "dist not found, running build:web"
  npm run build:web
fi

if [[ ! -f "$CADDYFILE_SRC" ]]; then
  echo "Missing $CADDYFILE_SRC"
  exit 1
fi

SITE_DOMAINS_NORMALIZED="$SITE_DOMAINS"
SITE_DOMAINS_NORMALIZED="${SITE_DOMAINS_NORMALIZED//,/ }"
SITE_DOMAINS_NORMALIZED="$(echo "$SITE_DOMAINS_NORMALIZED" | xargs)"

if [[ -z "$SITE_DOMAINS_NORMALIZED" ]]; then
  echo "SITE_DOMAINS is empty"
  exit 1
fi

# Convert space-separated list to Caddy host list, e.g. a.com, b.com, c.com
SITE_DOMAINS_CADDY="$(echo "$SITE_DOMAINS_NORMALIZED" | sed 's/ /, /g')"

echo "==> Preparing target directory: $TARGET_DIST"
sudo mkdir -p "$TARGET_DIST"

echo "==> Syncing dist to $TARGET_DIST"
sudo rsync -av --delete "$DIST_DIR/" "$TARGET_DIST/"

echo "==> Installing Caddyfile"
sudo cp "$CADDYFILE_SRC" "$CADDYFILE_TARGET"
sudo sed -i "s|__SITE_DOMAINS__|$SITE_DOMAINS_CADDY|g" "$CADDYFILE_TARGET"

echo "==> Active site domains: $SITE_DOMAINS_CADDY"

# Avoid 80/443 conflicts from nginx when Caddy takes over public traffic.
if sudo systemctl is-active --quiet nginx; then
  if sudo ss -lntp | grep -Eq ':80\s|:443\s'; then
    echo "==> Stopping nginx to prevent :80/:443 conflicts"
    sudo systemctl stop nginx || true
    sudo systemctl disable nginx || true
  fi
fi

echo "==> Validating Caddy config"
sudo caddy validate --config "$CADDYFILE_TARGET"

echo "==> Restarting Caddy"
sudo systemctl restart caddy
sudo systemctl is-active --quiet caddy

echo "==> Deployment via Caddy completed"
