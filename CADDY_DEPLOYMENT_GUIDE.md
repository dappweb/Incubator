# Multi-Site Caddy Deployment Guide

## Overview

Three projects are now served from a single Caddy instance on `t.test2dapp.xyz`:
- **t3.test2dapp.xyz** → Incubator (Web3 dApp)
- **t2.test2dapp.xyz** → 181bSeer (Seer Platform)
- **t1.test2dapp.xyz** → DefiNodeNexus (Placeholder)

All traffic flows through Cloudflare CDN with SSL/TLS termination (Full mode).

## Architecture

```
Cloudflare Edge (DNS, SSL/TLS)
    ↓
Origin Server: 52.195.182.243
    ↓
Caddy (Web Server, Auto-HTTPS)
    ├─ t3.test2dapp.xyz → /var/www/incubator/dist/
    ├─ t2.test2dapp.xyz → /var/www/seer/dist/
    └─ t1.test2dapp.xyz → /var/www/definode/dist/ [PLACEHOLDER]
```

## System Status

Check if Caddy is running:
```bash
sudo systemctl status caddy
```

View live configuration:
```bash
cat /etc/caddy/Caddyfile
```

Monitor logs in real-time:
```bash
sudo journalctl -u caddy -f
```

## Quick Deployment Commands

### Deploy All Sites at Once
```bash
bash /tmp/deploy-multi-sites.sh
```

### Deploy Single Site (Manual)

**Incubator (t3)**
```bash
cd /home/ubuntu/Incubator
npm run build
sudo rsync -a --delete dist/ /var/www/incubator/dist/
```

**181bSeer (t2)**
```bash
cd /home/ubuntu/181bSeer
npm run build
sudo rsync -a --delete dist/ /var/www/seer/dist/
```

**DefiNodeNexus (t1)**
```bash
cd /home/ubuntu/DefiNodeNexus
npm run build
sudo rsync -a --delete dist/ /var/www/definode/dist/
```

### Verify Deployment
```bash
curl -I https://t3.test2dapp.xyz
curl -I https://t2.test2dapp.xyz
curl -I https://t1.test2dapp.xyz
```

All should return `HTTP/2 200 OK`.

## Troubleshooting

### Site Returns 404
1. Check if dist folder exists: `ls -la /var/www/{incubator,seer,definode}/dist/`
2. Verify Caddyfile routing: `sudo caddy validate --config /etc/caddy/Caddyfile`
3. Restart Caddy: `sudo systemctl restart caddy`

### Cloudflare 525 Error
This indicates Caddy is not responding. Check:
```bash
# Test direct HTTPS connection to origin server
curl -kI https://52.195.182.243 -H "Host: t3.test2dapp.xyz"

# Verify Caddy is listening on port 443
sudo ss -tlnp | grep caddy

# Check for certificate issues
ls -la /var/lib/caddy/certificates/
```

### Certificate Issues
Caddy auto-manages Let's Encrypt certificates. To force renewal:
```bash
sudo systemctl stop caddy
sudo rm -rf /var/lib/caddy/
sudo systemctl start caddy
```

## Configuration Files

- **Web Server Config**: `/etc/caddy/Caddyfile`
- **Repository Template**: `deploy/caddy/Caddyfile`
- **Deployment Script**: `deploy/caddy/deploy.sh`
- **Diagnostic Script**: `scripts/diagnose-caddy-525.sh`

## When Deploying DefiNodeNexus

Currently `/var/www/definode/dist/index.html` is a placeholder. Once the real DefiNodeNexus project is deployed:

1. Clone/setup the project to `/home/ubuntu/DefiNodeNexus/`
2. Build: `cd /home/ubuntu/DefiNodeNexus && npm run build`
3. Deploy: `sudo rsync -a --delete dist/ /var/www/definode/dist/`
4. Done! No Caddyfile changes needed (already configured)

## Performance Tips

- **Cache Headers** are set to 31536000s (1 year) for `/assets/*` files
- **HTML files** use `no-cache, must-revalidate` for proper SPA updates
- **Gzip compression** is enabled by default
- **Security headers** are set on all responses (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)

## Adding a New Site

To add a fourth domain to Caddy:

1. Add a new server block to `/etc/caddy/Caddyfile`:
```
newdomain.example.com {
    root * /var/www/newdomain/dist
    encode gzip
    try_files {path} /index.html
    file_server
    header {
        X-Content-Type-Options nosniff
        Cache-Control @assets "public, max-age=31536000, immutable"
        Cache-Control @html "no-cache, must-revalidate"
    }
}
```

2. Create the directory and deploy files: `sudo mkdir -p /var/www/newdomain/dist`
3. Validate: `sudo caddy validate --config /etc/caddy/Caddyfile`
4. Reload: `sudo systemctl reload caddy`

## DNS Records

All three domains should have A records pointing to `52.195.182.243`:

```
t3.test2dapp.xyz  IN A 52.195.182.243
t2.test2dapp.xyz  IN A 52.195.182.243
t1.test2dapp.xyz  IN A 52.195.182.243
```

Currently managed via Cloudflare.

## Support

For detailed diagnostics:
```bash
bash scripts/diagnose-caddy-525.sh
```

This provides comprehensive health checks for all three domains.
