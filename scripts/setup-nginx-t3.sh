#!/usr/bin/env bash
set -euo pipefail

DOMAIN="t3.test2dapp.xyz"
PROJECT_DIR="/home/ubuntu/Incubator"
SOURCE_CONF="$PROJECT_DIR/deploy/nginx/$DOMAIN.conf"
TARGET_CONF="/etc/nginx/sites-available/$DOMAIN"
ENABLED_LINK="/etc/nginx/sites-enabled/$DOMAIN"

if [[ ! -f "$SOURCE_CONF" ]]; then
  echo "Nginx source config not found: $SOURCE_CONF"
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

echo "Nginx configured for http://$DOMAIN/ -> 127.0.0.1:5173"
