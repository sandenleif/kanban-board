#!/bin/sh
set -e

echo "🔍 Checking environment..."
[ -z "$DATABASE_URL" ] && echo "❌ DATABASE_URL is not set" && exit 1
[ -z "$JWT_SECRET" ]   && echo "❌ JWT_SECRET is not set"   && exit 1

if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "❌ JWT_SECRET must be at least 32 characters"
  exit 1
fi

PRISMA="node node_modules/prisma/build/index.js"

echo "📦 Pushing database schema..."
until $PRISMA db push --accept-data-loss 2>&1; do
  echo "   DB not ready yet, retrying in 3s..."
  sleep 3
done

echo "🔧 Setting up search indexes and extensions..."
psql "$DATABASE_URL" <<'SQL'
-- Trigram extension for fast full-text search (ILIKE '%x%' with index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Cache warming extension
CREATE EXTENSION IF NOT EXISTS pg_prewarm;

-- Trigram indexes for full-text search on tickets
CREATE INDEX IF NOT EXISTS tickets_title_trgm
  ON tickets USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tickets_description_trgm
  ON tickets USING GIN (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tickets_fromname_trgm
  ON tickets USING GIN ("fromName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tickets_fromemail_trgm
  ON tickets USING GIN ("fromEmail" gin_trgm_ops);

-- Warm the most-accessed tables into shared_buffers
SELECT pg_prewarm('tickets');
SELECT pg_prewarm('"tickets_organizationId_status_idx"');
SELECT pg_prewarm('"tickets_organizationId_createdAt_idx"');
SELECT pg_prewarm('tickets_title_trgm');
SQL

echo "✅ DB setup complete"

echo "🚀 Starting KanbanFlow on port ${PORT:-3000}..."
exec node server.js
