#!/bin/bash
set -e

echo "[entrypoint] Waiting for PostgreSQL to be ready..."
until pg_isready -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" -q; do
  sleep 2
done
echo "[entrypoint] PostgreSQL is ready."

echo "[entrypoint] Running Prisma migrations..."
npx prisma migrate deploy
echo "[entrypoint] Migrations complete."

echo "[entrypoint] Starting application..."
exec "$@"
