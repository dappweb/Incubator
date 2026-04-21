#!/usr/bin/env bash
set -euo pipefail

SITE_DOMAINS="${SITE_DOMAINS:-t1.test2dapp.xyz,t2.test2dapp.xyz,t3.test2dapp.xyz}"
CADDY_SERVICE_NAME="${CADDY_SERVICE_NAME:-caddy}"
CURL_TIMEOUT="${CURL_TIMEOUT:-12}"

normalize_domains() {
  local raw="$1"
  raw="${raw//,/ }"
  echo "$raw" | xargs
}

check_domain() {
  local domain="$1"
  local url="https://${domain}"
  local code

  code="$(curl -sSIL -o /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" "$url" || true)"
  if [[ "$code" =~ ^2|3 ]]; then
    echo "[OK] ${domain} -> HTTPS ${code}"
    return 0
  fi

  # Fallback probe for cases where TLS is temporarily provisioning.
  code="$(curl -sSIL -o /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" "http://${domain}" || true)"
  if [[ "$code" =~ ^2|3 ]]; then
    echo "[WARN] ${domain} -> HTTPS failed, HTTP ${code}"
    return 0
  fi

  echo "[FAIL] ${domain} -> HTTPS/HTTP unavailable"
  return 1
}

run_checks() {
  local domains="$1"
  local failed=""

  for d in $domains; do
    if ! check_domain "$d"; then
      failed+=" $d"
    fi
  done

  echo "$failed" | xargs
}

domains="$(normalize_domains "$SITE_DOMAINS")"
if [[ -z "$domains" ]]; then
  echo "SITE_DOMAINS is empty"
  exit 1
fi

echo "==> Caddy site health check"
echo "Domains: $domains"

failed_domains="$(run_checks "$domains")"
if [[ -z "$failed_domains" ]]; then
  echo "==> All domains healthy"
  exit 0
fi

echo "==> Detected unhealthy domains: $failed_domains"
echo "==> Restarting ${CADDY_SERVICE_NAME} and rechecking"
sudo systemctl restart "$CADDY_SERVICE_NAME"
sudo systemctl is-active --quiet "$CADDY_SERVICE_NAME"

failed_after_restart="$(run_checks "$domains")"
if [[ -n "$failed_after_restart" ]]; then
  echo "==> Unhealthy after restart: $failed_after_restart"
  exit 2
fi

echo "==> Recovered after restart"
