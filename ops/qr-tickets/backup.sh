#!/bin/bash
# Daily PostgreSQL backup to S3
# Installed by deploy.sh — runs as ubuntu cron job at 02:00 UTC

set -euo pipefail

BACKUP_ENV="/opt/qr-tickets/env/backup.env"
CONTAINER="$(docker ps --filter name=postgres --format '{{.Names}}' | head -1)"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
DATE=$(date -u +"%Y-%m-%d")
TMP_FILE="/tmp/qr_tickets_${TIMESTAMP}.sql.gz"
LOG_FILE="/opt/qr-tickets/backup.log"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "$LOG_FILE"
}

# Load AWS credentials and config
if [ ! -f "$BACKUP_ENV" ]; then
  log "ERROR: backup.env not found at $BACKUP_ENV"
  exit 1
fi
# shellcheck source=/dev/null
source "$BACKUP_ENV"

: "${AWS_REGION:?AWS_REGION not set}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID not set}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY not set}"
: "${S3_BUCKET_NAME:?S3_BUCKET_NAME not set}"
: "${DB_USER:?DB_USER not set}"
: "${DB_NAME:?DB_NAME not set}"

export AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY

S3_KEY="db-backups/${DATE}/qr_tickets_${TIMESTAMP}.sql.gz"

if [ -z "$CONTAINER" ]; then
  log "ERROR: postgres container not found"
  exit 1
fi

log "Starting backup of ${DB_NAME} from container ${CONTAINER}..."

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$TMP_FILE"
DUMP_SIZE=$(du -sh "$TMP_FILE" | cut -f1)
log "Dump complete — size: ${DUMP_SIZE}"

aws s3 cp "$TMP_FILE" "s3://${S3_BUCKET_NAME}/${S3_KEY}" \
  --storage-class STANDARD_IA \
  --region "$AWS_REGION"
log "Uploaded to s3://${S3_BUCKET_NAME}/${S3_KEY}"

rm -f "$TMP_FILE"

# Prune backups older than 30 days from S3
# Delete specific date prefixes from day 31 to day 60 (no s3:ListBucket needed)
log "Pruning S3 backups older than 30 days..."
for age in $(seq 31 60); do
  OLD_DATE=$(date -u -d "${age} days ago" +"%Y-%m-%d" 2>/dev/null || date -u -v-${age}d +"%Y-%m-%d")
  aws s3 rm "s3://${S3_BUCKET_NAME}/db-backups/${OLD_DATE}/" --recursive --region "$AWS_REGION" --quiet 2>/dev/null || true
done

log "Backup complete."
