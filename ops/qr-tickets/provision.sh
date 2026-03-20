#!/bin/bash
set -e

ENV_FILE="/tmp/qr_tickets.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

: "${DOMAIN:?DOMAIN not set}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL not set}"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

sudo mkdir -p /etc/needrestart/conf.d
sudo tee /etc/needrestart/conf.d/99-qr.conf >/dev/null <<'EOF'
$nrconf{restart} = 'a';
$nrconf{kernelhints} = -1;
EOF

echo "[provision] Installing system packages..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release ufw git nginx

if ! command -v docker >/dev/null 2>&1; then
  echo "[provision] Installing Docker..."
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
fi

sudo systemctl enable --now docker
sudo systemctl enable --now nginx

echo "[provision] Configuring firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "[provision] Creating /opt/qr-tickets directories..."
sudo mkdir -p /opt/qr-tickets/app /opt/qr-tickets/env /opt/qr-tickets/uploads /opt/qr-tickets/postgres
sudo chown -R ubuntu:ubuntu /opt/qr-tickets

echo "[provision] Writing Nginx config for ${DOMAIN}..."
sudo tee /etc/nginx/sites-available/qr-tickets.conf >/dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    client_max_body_size 20m;

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

    location /api/ {
        proxy_pass http://127.0.0.1:4100;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
    }

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
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "[provision] Installing Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

echo "[provision] Issuing TLS certificate for ${DOMAIN}..."
sudo certbot --nginx -d "${DOMAIN}" \
  --agree-tos -m "${LETSENCRYPT_EMAIL}" --non-interactive --redirect --keep-until-expiring

sudo systemctl reload nginx
echo "[provision] Done."
