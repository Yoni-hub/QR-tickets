#!/bin/bash
set -e

# NOTE: Server already has Docker, Nginx, Certbot, UFW from Connsura provisioning.
# This script only adds what's needed for QR Tickets specifically.

ENV_FILE="/tmp/qr_tickets.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

: "${DOMAIN:?DOMAIN not set}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL not set}"

export DEBIAN_FRONTEND=noninteractive

# ─── Directories ─────────────────────────────────────────────────────────────
echo "[provision] Creating /opt/qr-tickets directories..."
sudo mkdir -p /opt/qr-tickets/app /opt/qr-tickets/env /opt/qr-tickets/uploads /opt/qr-tickets/postgres
sudo chown -R ubuntu:ubuntu /opt/qr-tickets

# ─── Nginx vhost ─────────────────────────────────────────────────────────────
echo "[provision] Writing Nginx config for ${DOMAIN}..."
sudo tee /etc/nginx/sites-available/qr-tickets.conf >/dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 20m;

    # WebSocket (socket.io)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # API (no rewrite — backend registers routes under /api)
    location /api/ {
        proxy_pass http://127.0.0.1:4100;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/qr-tickets.conf /etc/nginx/sites-enabled/qr-tickets.conf
sudo nginx -t
sudo systemctl reload nginx

# ─── TLS certificate ─────────────────────────────────────────────────────────
echo "[provision] Issuing TLS certificate for ${DOMAIN}..."
sudo certbot --nginx -d "${DOMAIN}" \
  --agree-tos -m "${LETSENCRYPT_EMAIL}" --non-interactive --redirect --keep-until-expiring

sudo systemctl reload nginx
echo "[provision] Done."
