#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
until PGPASSWORD="${DB_PASSWORD:-postgres}" pg_isready \
  -h "${DB_HOST:-db}" \
  -p "${DB_PORT:-5432}" \
  -U "${DB_USER:-postgres}" 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready!"

# ── Ensure the Prisma query engine is present ───────────────
# If .prisma-build/ was provided, the engine is at /app/engine/
# and PRISMA_QUERY_ENGINE_LIBRARY points to it. This block is
# only reached as a fallback when no .prisma-build/ was provided.
ENGINE_FILE="${PRISMA_QUERY_ENGINE_LIBRARY:-/app/node_modules/.prisma/client/libquery_engine.so.node}"

if [ ! -f "$ENGINE_FILE" ]; then
  echo "Prisma query engine not found — downloading..."
  node /app/scripts/download-engine.cjs "$(dirname "$ENGINE_FILE")"
  if [ ! -f "$ENGINE_FILE" ]; then
    echo "ERROR: Prisma query engine could not be downloaded."
    exit 1
  fi
  echo "Engine downloaded."
fi

# ── Apply database schema ──────────────────────────────────
echo "Pushing database schema..."
npx prisma db push --skip-generate
echo "Schema pushed!"

# ── Start the application ──────────────────────────────────
echo "Starting application..."
exec "$@"
