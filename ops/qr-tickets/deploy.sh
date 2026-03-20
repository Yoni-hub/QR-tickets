#!/bin/bash
set -e

# ─── Load env ───────────────────────────────────────────────────────────────
ENV_FILE="/tmp/qr_tickets.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

APP_DIR="/opt/qr-tickets/app"
ENV_DIR="/opt/qr-tickets/env"
UPLOADS_DIR="/opt/qr-tickets/uploads"
POSTGRES_DIR="/opt/qr-tickets/postgres"
COMPOSE_FILE="$APP_DIR/docker-compose.yml"
LOG_FILE="/opt/qr-tickets/deployments.log"

# ─── Directories ────────────────────────────────────────────────────────────
echo "[deploy] Creating directories..."
sudo mkdir -p "$APP_DIR" "$ENV_DIR" "$UPLOADS_DIR" "$POSTGRES_DIR"
sudo chown -R ubuntu:ubuntu /opt/qr-tickets

# ─── Git ────────────────────────────────────────────────────────────────────
echo "[deploy] Syncing repo..."
if [ ! -d "$APP_DIR/.git" ]; then
  git init "$APP_DIR"
  git -C "$APP_DIR" remote add origin "$REPO_URL"
fi
git -C "$APP_DIR" fetch origin
git -C "$APP_DIR" checkout -B "$REPO_BRANCH" "origin/$REPO_BRANCH"
git -C "$APP_DIR" pull origin "$REPO_BRANCH"

GIT_SHA=$(git -C "$APP_DIR" rev-parse HEAD)
DEPLOY_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ─── Generate secrets ───────────────────────────────────────────────────────
if [ -z "$DB_PASSWORD" ]; then
  # Reuse existing password if already set, otherwise generate
  EXISTING=$(grep -s "^DB_PASSWORD=" "$ENV_DIR/backend.env" | cut -d= -f2 || true)
  DB_PASSWORD="${EXISTING:-$(openssl rand -hex 24)}"
fi

if [ -z "$ADMIN_PANEL_KEY" ]; then
  EXISTING=$(grep -s "^ADMIN_PANEL_KEY=" "$ENV_DIR/backend.env" | cut -d= -f2 || true)
  ADMIN_PANEL_KEY="${EXISTING:-$(openssl rand -hex 24)}"
fi

# ─── Write backend env ──────────────────────────────────────────────────────
echo "[deploy] Writing backend env..."
cat > "$ENV_DIR/backend.env" <<EOF
NODE_ENV=production
PORT=${PORT:-4100}
DB_HOST=postgres
DB_PORT=5432
DB_NAME=${DB_NAME:-qr_tickets}
DB_USER=${DB_USER:-qr_user}
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://${DB_USER:-qr_user}:${DB_PASSWORD}@postgres:5432/${DB_NAME:-qr_tickets}?schema=public
PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-https://qr-tickets.connsura.com}
ADMIN_PANEL_KEY=${ADMIN_PANEL_KEY}
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
MAIL_FROM=${MAIL_FROM:-no-reply@connsura.com}
EOF

# ─── Write postgres env ─────────────────────────────────────────────────────
cat > "$ENV_DIR/postgres.env" <<EOF
POSTGRES_DB=${DB_NAME:-qr_tickets}
POSTGRES_USER=${DB_USER:-qr_user}
POSTGRES_PASSWORD=${DB_PASSWORD}
EOF

# ─── Symlink compose env ────────────────────────────────────────────────────
# docker-compose.yml reads DB_* from environment; export them for compose
export DB_NAME="${DB_NAME:-qr_tickets}"
export DB_USER="${DB_USER:-qr_user}"
export DB_PASSWORD="$DB_PASSWORD"

# ─── Build & start containers ───────────────────────────────────────────────
echo "[deploy] Building and starting containers..."
sudo docker compose -f "$COMPOSE_FILE" up -d --build

# ─── Log ────────────────────────────────────────────────────────────────────
echo "[deploy] Done. sha=$GIT_SHA time=$DEPLOY_TIME"
echo "$DEPLOY_TIME | sha=$GIT_SHA | branch=$REPO_BRANCH | domain=$DOMAIN" >> "$LOG_FILE"
