#!/usr/bin/env bash
# scripts/run-settlement.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/deploy/logs"
RUN_LIGHT="true"
RUN_CORE="true"

usage() {
  cat <<'EOF'
Usage: bash scripts/run-settlement.sh [options]

Options:
  --light-only   Run LIGHT settlement only
  --core-only    Run core pool settlement only
  -h, --help     Show help
EOF
}

for arg in "$@"; do
  case "$arg" in
    --light-only)
      RUN_LIGHT="true"
      RUN_CORE="false"
      ;;
    --core-only)
      RUN_LIGHT="false"
      RUN_CORE="true"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      usage
      exit 1
      ;;
  esac
done

mkdir -p "$LOG_DIR"
timestamp="$(date +%Y%m%d-%H%M%S)"
log_file="$LOG_DIR/settlement-$timestamp.log"

cd "$PROJECT_ROOT"

echo "[settlement] start at $(date -Iseconds)" | tee -a "$log_file"

if [[ "$RUN_LIGHT" == "true" ]]; then
  echo "[settlement] running LIGHT settlement" | tee -a "$log_file"
  npm run settle:light:cncMainnet 2>&1 | tee -a "$log_file"
fi

if [[ "$RUN_CORE" == "true" ]]; then
  echo "[settlement] running core pool settlement" | tee -a "$log_file"
  npm run settle:core:cncMainnet 2>&1 | tee -a "$log_file"
fi

echo "[settlement] done at $(date -Iseconds)" | tee -a "$log_file"
echo "[settlement] log: $log_file"
