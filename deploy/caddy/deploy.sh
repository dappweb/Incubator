#!/usr/bin/env bash
# deploy/caddy/deploy.sh
# Build the frontend and deploy static files to the Caddy web root.
# Run on the server from the project root: bash deploy/caddy/deploy.sh

set -euo pipefail

DIST_DIR="$(cd "$(dirname "$0")/../.." && pwd)/dist"
WEB_ROOT="/var/www/incubator/dist"

echo "==> Building frontend..."
npm run build:web

echo "==> Syncing dist/ to ${WEB_ROOT}..."
sudo mkdir -p "${WEB_ROOT}"
sudo rsync -a --delete "${DIST_DIR}/" "${WEB_ROOT}/"

echo "==> Reloading Caddy..."
sudo systemctl reload caddy

echo "==> Done. Site live at https://t3.test2dapp.xyz"
