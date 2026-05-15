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

echo "🚀 Starting KanbanFlow on port ${PORT:-3000}..."
exec node server.js
