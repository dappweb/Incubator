#!/usr/bin/env bash
set -euo pipefail

DOMAIN="t3.test2dapp.xyz"
PROJECT_DIR="/home/ubuntu/Incubator"
SOURCE_CONF="$PROJECT_DIR/deploy/nginx/$DOMAIN.conf"
TARGET_CONF="/etc/nginx/sites-available/$DOMAIN"
ENABLED_LINK="/etc/nginx/sites-enabled/$DOMAIN"
ORIGIN_CERT="/etc/ssl/cloudflare/$DOMAIN.pem"
ORIGIN_KEY="/etc/ssl/cloudflare/$DOMAIN.key"

if [[ ! -f "$SOURCE_CONF" ]]; then
  echo "Nginx source config not found: $SOURCE_CONF"
  exit 1
fi

if [[ ! -f "$ORIGIN_CERT" || ! -f "$ORIGIN_KEY" ]]; then
  echo "Missing Cloudflare Origin Certificate files."
  echo "Expected:"
  echo "  $ORIGIN_CERT"
  echo "  $ORIGIN_KEY"
  echo
  echo "Create an Origin Certificate in Cloudflare dashboard, then upload files to /etc/ssl/cloudflare/."
  exit 1
fi

sudo cp "$SOURCE_CONF" "$TARGET_CONF"

if [[ -L "$ENABLED_LINK" || -e "$ENABLED_LINK" ]]; then
  sudo rm -f "$ENABLED_LINK"
fi

sudo ln -s "$TARGET_CONF" "$ENABLED_LINK"

if [[ -L "/etc/nginx/sites-enabled/default" || -f "/etc/nginx/sites-enabled/default" ]]; then
  sudo rm -f /etc/nginx/sites-enabled/default
fi

sudo nginx -t
sudo systemctl reload nginx

echo "Nginx configured for https://$DOMAIN/ -> 127.0.0.1:5173"
