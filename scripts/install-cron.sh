#!/usr/bin/env bash
# scripts/install-cron.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="$PROJECT_ROOT/scripts/run-settlement.sh"
CRON_TAG="# incubator-settlement"

if [[ ! -x "$RUNNER" ]]; then
  chmod +x "$RUNNER"
fi

temp_file="$(mktemp)"

{
  crontab -l 2>/dev/null | grep -v "$CRON_TAG" || true
  echo "0 * * * * cd $PROJECT_ROOT && bash scripts/run-settlement.sh --light-only $CRON_TAG"
  echo "10 0 * * * cd $PROJECT_ROOT && bash scripts/run-settlement.sh --core-only $CRON_TAG"
} > "$temp_file"

crontab "$temp_file"
rm -f "$temp_file"

echo "Installed settlement cron jobs:"
crontab -l | grep "$CRON_TAG" || true
