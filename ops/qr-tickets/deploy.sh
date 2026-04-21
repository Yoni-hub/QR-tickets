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
sudo chown -R ubuntu:ubuntu "$APP_DIR" "$ENV_DIR" "$UPLOADS_DIR"
sudo chown -R 999:999 "$POSTGRES_DIR"

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

read_existing_env() {
  local key="$1"
  local file="$ENV_DIR/backend.env"
  if [ ! -f "$file" ]; then
    return 0
  fi
  local line
  line=$(grep -m1 "^${key}=" "$file" || true)
  if [ -n "$line" ]; then
    printf '%s' "${line#*=}"
  fi
}

OPENAI_API_KEY="${OPENAI_API_KEY:-$(read_existing_env OPENAI_API_KEY)}"
TIKTOK_CLIENT_KEY="${TIKTOK_CLIENT_KEY:-$(read_existing_env TIKTOK_CLIENT_KEY)}"
TIKTOK_CLIENT_SECRET="${TIKTOK_CLIENT_SECRET:-$(read_existing_env TIKTOK_CLIENT_SECRET)}"
TOKEN_ENCRYPTION_KEY="${TOKEN_ENCRYPTION_KEY:-$(read_existing_env TOKEN_ENCRYPTION_KEY)}"
PEXELS_API_KEY="${PEXELS_API_KEY:-$(read_existing_env PEXELS_API_KEY)}"
PIXABAY_API_KEY="${PIXABAY_API_KEY:-$(read_existing_env PIXABAY_API_KEY)}"

if [ -z "$TOKEN_ENCRYPTION_KEY" ]; then
  TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"
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
TURNSTILE_SECRET=${TURNSTILE_SECRET}
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
S3_BUCKET_NAME=${S3_BUCKET_NAME}
TIKTOK_CLIENT_KEY=${TIKTOK_CLIENT_KEY}
TIKTOK_CLIENT_SECRET=${TIKTOK_CLIENT_SECRET}
TIKTOK_REDIRECT_URI=${TIKTOK_REDIRECT_URI:-https://qr-tickets.connsura.com/tiktok/callback}
TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_TEXT_MODEL=${OPENAI_TEXT_MODEL:-gpt-5.2}
OPENAI_TEXT_TEMPERATURE=${OPENAI_TEXT_TEMPERATURE:-1.0}
OPENAI_TTS_MODEL=${OPENAI_TTS_MODEL:-gpt-4o-mini-tts}
OPENAI_TTS_VOICE=${OPENAI_TTS_VOICE:-marin}
OPENAI_IMAGE_MODEL=${OPENAI_IMAGE_MODEL:-gpt-image-1}
OPENAI_SCENE_SIZE=${OPENAI_SCENE_SIZE:-1024x1536}
OPENAI_SCENE_QUALITY=${OPENAI_SCENE_QUALITY:-medium}
OPENAI_SCENE_STYLE="${OPENAI_SCENE_STYLE:-dynamic event atmosphere, cinematic lighting, realistic photography}"
PEXELS_API_KEY=${PEXELS_API_KEY}
PIXABAY_API_KEY=${PIXABAY_API_KEY}
PROMO_BROLL_PROVIDERS="${PROMO_BROLL_PROVIDERS:-pexels,pixabay}"
PROMO_BROLL_QUERIES="${PROMO_BROLL_QUERIES:-event entrance,concert entrance,ticket scanning,qr code scan,people scanning qr code,crowd at event,busy check in,smartphone qr code}"
PROMO_BROLL_MAX_MB=${PROMO_BROLL_MAX_MB:-70}
PROMO_VIDEO_TEMPLATE=${PROMO_VIDEO_TEMPLATE:-auto}
PROMO_SCENE_SOURCE=${PROMO_SCENE_SOURCE:-auto}
PROMO_SCENE_COUNT=${PROMO_SCENE_COUNT:-4}
FFMPEG_PATH=${FFMPEG_PATH}
EOF

# ─── Write postgres env ─────────────────────────────────────────────────────
cat > "$ENV_DIR/postgres.env" <<EOF
POSTGRES_DB=${DB_NAME:-qr_tickets}
POSTGRES_USER=${DB_USER:-qr_user}
POSTGRES_PASSWORD=${DB_PASSWORD}
EOF

# ─── Write backup env ───────────────────────────────────────────────────────
cat > "$ENV_DIR/backup.env" <<EOF
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
S3_BUCKET_NAME=${S3_BUCKET_NAME}
DB_USER=${DB_USER:-qr_user}
DB_NAME=${DB_NAME:-qr_tickets}
EOF
chmod 600 "$ENV_DIR/backup.env"

# ─── Write compose .env (docker-compose reads this automatically, even under sudo) ───
cat > "$APP_DIR/.env" <<EOF
DB_NAME=${DB_NAME:-qr_tickets}
DB_USER=${DB_USER:-qr_user}
DB_PASSWORD=${DB_PASSWORD}
EOF

# ─── Install AWS CLI (idempotent) ───────────────────────────────────────────
if ! command -v aws &>/dev/null; then
  echo "[deploy] Installing AWS CLI..."
  sudo apt-get install -y --no-install-recommends awscli
fi

# ─── Install backup script and cron job ─────────────────────────────────────
echo "[deploy] Installing backup script..."
sudo cp "$APP_DIR/ops/qr-tickets/backup.sh" /opt/qr-tickets/backup.sh
sudo chown ubuntu:ubuntu /opt/qr-tickets/backup.sh
chmod +x /opt/qr-tickets/backup.sh

CRON_JOB="0 2 * * * /opt/qr-tickets/backup.sh >> /opt/qr-tickets/backup.log 2>&1"
# Install cron only if not already present
if ! crontab -l 2>/dev/null | grep -qF "backup.sh"; then
  ( crontab -l 2>/dev/null; echo "$CRON_JOB" ) | crontab -
  echo "[deploy] Backup cron installed (daily 02:00 UTC)"
fi

# ─── Build & start containers ───────────────────────────────────────────────
echo "[deploy] Building and starting containers..."
sudo docker compose -f "$COMPOSE_FILE" up -d --build

# ─── Log ────────────────────────────────────────────────────────────────────
echo "[deploy] Done. sha=$GIT_SHA time=$DEPLOY_TIME"
echo "$DEPLOY_TIME | sha=$GIT_SHA | branch=$REPO_BRANCH | domain=$DOMAIN" >> "$LOG_FILE"
