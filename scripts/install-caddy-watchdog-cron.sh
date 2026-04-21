#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECK_SCRIPT="$PROJECT_ROOT/scripts/check-caddy-sites.sh"
LOG_FILE="${CADDY_WATCHDOG_LOG:-/var/log/incubator-caddy-watchdog.log}"
CRON_EXPR="${CADDY_WATCHDOG_CRON_EXPR:-*/5 * * * *}"
SITE_DOMAINS="${SITE_DOMAINS:-t1.test2dapp.xyz,t2.test2dapp.xyz,t3.test2dapp.xyz}"

if [[ ! -f "$CHECK_SCRIPT" ]]; then
  echo "Missing check script: $CHECK_SCRIPT"
  exit 1
fi

line="$CRON_EXPR SITE_DOMAINS=\"$SITE_DOMAINS\" bash $CHECK_SCRIPT >> $LOG_FILE 2>&1"

tmp_file="$(mktemp)"
crontab -l 2>/dev/null | grep -v "$CHECK_SCRIPT" > "$tmp_file" || true
echo "$line" >> "$tmp_file"
crontab "$tmp_file"
rm -f "$tmp_file"

echo "==> Installed Caddy watchdog cron"
echo "Cron: $CRON_EXPR"
echo "Domains: $SITE_DOMAINS"
echo "Log: $LOG_FILE"
