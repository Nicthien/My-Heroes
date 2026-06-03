#!/usr/bin/env bash
# Apply the My Heroes schema to a self-hosted Supabase Postgres (Unraid).
#
# Run this AFTER the Supabase stack is up. It pipes supabase/schema.sql into the
# `db` container via psql over the local socket (no password needed inside the
# container). schema.sql is the source of truth for a fresh install, so it is
# sufficient on its own for a brand-new database.
#
# Usage (from the dir holding the compose files, e.g. /mnt/user/appdata/my-heroes):
#   ./apply-schema-unraid.sh
#
# Override paths if your layout differs:
#   SUPABASE_COMPOSE=./supabase-docker/docker-compose.yml \
#   SCHEMA=./schema.sql ./apply-schema-unraid.sh

set -euo pipefail

SUPABASE_COMPOSE="${SUPABASE_COMPOSE:-./supabase-docker/docker-compose.yml}"
SCHEMA="${SCHEMA:-./schema.sql}"
DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"

if [[ ! -f "$SCHEMA" ]]; then
  echo "ERROR: schema file not found: $SCHEMA" >&2
  exit 1
fi

echo "Applying $SCHEMA to service '$DB_SERVICE' (db=$DB_NAME, user=$DB_USER)..."
docker compose -f "$SUPABASE_COMPOSE" exec -T "$DB_SERVICE" \
  psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$SCHEMA"

echo "Schema applied successfully."
