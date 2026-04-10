#!/usr/bin/env bash
# deploy/caddy/deploy.sh
# Build the frontend and deploy static files to the Caddy web root.
# Run on the server from the project root: bash deploy/caddy/deploy.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
WEB_ROOT="/var/www/incubator/dist"
CADDY_SOURCE="$PROJECT_ROOT/deploy/caddy/Caddyfile"
CADDY_TARGET="/etc/caddy/Caddyfile"

if [[ ! -f "$CADDY_SOURCE" ]]; then
	echo "Caddyfile not found: $CADDY_SOURCE"
	exit 1
fi

echo "==> Building frontend..."
npm run build:web

echo "==> Syncing dist/ to ${WEB_ROOT}..."
sudo mkdir -p "${WEB_ROOT}"
sudo rsync -a --delete "${DIST_DIR}/" "${WEB_ROOT}/"

echo "==> Installing Caddyfile..."
sudo cp "$CADDY_SOURCE" "$CADDY_TARGET"
sudo caddy fmt --overwrite "$CADDY_TARGET"
sudo caddy validate --config "$CADDY_TARGET"

if systemctl is-active --quiet nginx; then
	echo "==> Nginx is running on this host, stopping it to free ports 80/443..."
	sudo systemctl disable --now nginx
fi

echo "==> Reloading Caddy..."
sudo systemctl daemon-reload
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager --full | head -n 20

echo "==> Done. Site live at https://t3.test2dapp.xyz"
