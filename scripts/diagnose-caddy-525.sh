#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-t3.test2dapp.xyz}"
SERVER_IP="${2:-}"

echo "==> Diagnose 525 for domain: ${DOMAIN}"
echo

echo "[1/8] DNS resolution"
if command -v dig >/dev/null 2>&1; then
  dig +short "${DOMAIN}" | sed '/^$/d' || true
else
  getent ahostsv4 "${DOMAIN}" | awk '{print $1}' | sort -u || true
fi
echo

echo "[2/8] HTTP/HTTPS from current host"
curl -I -m 10 "http://${DOMAIN}" || true
curl -I -m 10 "https://${DOMAIN}" || true
echo

echo "[3/8] Listener check (:80/:443)"
sudo ss -lntp | egrep ':80|:443' || true
echo

echo "[4/8] Service status"
echo "--- caddy ---"
sudo systemctl status caddy --no-pager -l | sed -n '1,80p' || true
echo "--- nginx ---"
sudo systemctl status nginx --no-pager -l | sed -n '1,60p' || true
echo

echo "[5/8] Caddy validate + formatted preview"
if [[ -f /etc/caddy/Caddyfile ]]; then
  sudo caddy validate --config /etc/caddy/Caddyfile || true
  sudo sed -n '1,220p' /etc/caddy/Caddyfile
else
  echo "/etc/caddy/Caddyfile not found"
fi
echo

echo "[6/8] Recent Caddy logs"
sudo journalctl -u caddy -n 120 --no-pager || true
echo

echo "[7/8] Origin direct check (bypass Cloudflare)"
if [[ -z "${SERVER_IP}" ]]; then
  echo "Skip direct origin check: no SERVER_IP provided"
  echo "Usage: bash scripts/diagnose-caddy-525.sh ${DOMAIN} <server_public_ip>"
else
  echo "Using SERVER_IP=${SERVER_IP}"
  curl -I --resolve "${DOMAIN}:80:${SERVER_IP}" "http://${DOMAIN}" || true
  curl -kI --resolve "${DOMAIN}:443:${SERVER_IP}" "https://${DOMAIN}" || true
fi
echo

echo "[8/8] Cloudflare handshake indicators"
echo "- If HTTPS here is 525 and direct origin HTTPS fails: source server 443/TLS issue"
echo "- If direct origin HTTPS works but Cloudflare still 525: check Cloudflare SSL mode and DNS target"

echo
echo "==> Diagnose complete"