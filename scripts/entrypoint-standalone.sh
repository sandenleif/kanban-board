#!/bin/sh
set -e

DATA_DIR="/data"
PG_DATA="$DATA_DIR/postgresql"
JWT_FILE="$DATA_DIR/jwt_secret"

PG_USER="kanban"
PG_DB="kanban_board"
PG_PASS="kanban_internal_$(hostname | tr -dc 'a-zA-Z0-9' | head -c 8)"

# ─── Volume warning ───────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"
if [ ! -f "$DATA_DIR/.initialized" ]; then
  echo "⚠️  Tip: mount a volume at /data to persist your database and JWT secret:"
  echo "   docker run -v kanban_data:/data -p 3000:3000 ..."
fi

# ─── JWT Secret ───────────────────────────────────────────────────────────────
if [ -n "$JWT_SECRET" ]; then
  echo "🔑 Using JWT_SECRET from environment variable"
elif [ -f "$JWT_FILE" ]; then
  JWT_SECRET=$(cat "$JWT_FILE")
  echo "🔑 Loaded existing JWT secret from persistent storage"
else
  JWT_SECRET=$(openssl rand -base64 48)
  echo "$JWT_SECRET" > "$JWT_FILE"
  chmod 600 "$JWT_FILE"
  echo "🔑 Generated new JWT secret (saved to $JWT_FILE)"
fi
export JWT_SECRET

# ─── PostgreSQL initialisation ────────────────────────────────────────────────
mkdir -p "$PG_DATA"
chown postgres:postgres "$PG_DATA"
chmod 700 "$PG_DATA"

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "📦 Initialising PostgreSQL cluster..."
  su-exec postgres initdb -D "$PG_DATA" --encoding=UTF8 --locale=C -A trust -U postgres
fi

# Allow passwordless local connections (internal to the container only)
cat > "$PG_DATA/pg_hba.conf" << 'EOF'
local all all trust
host  all all 127.0.0.1/32 trust
host  all all ::1/128      trust
EOF

# Remove stale PID file left by an unclean shutdown (e.g. OOM kill)
rm -f "$PG_DATA/postmaster.pid"

echo "🐘 Starting PostgreSQL..."
su-exec postgres pg_ctl -D "$PG_DATA" -o "-h 127.0.0.1 -p 5432" \
  -l "$PG_DATA/postgres.log" start

until su-exec postgres pg_isready -h 127.0.0.1 -p 5432 -q; do
  sleep 1
done
echo "✅ PostgreSQL ready"

# Create app role and database if they do not exist yet
su-exec postgres psql -h 127.0.0.1 -p 5432 -U postgres -tc \
  "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'" | grep -q 1 || \
  su-exec postgres psql -h 127.0.0.1 -p 5432 -U postgres -c \
    "CREATE ROLE $PG_USER WITH LOGIN PASSWORD '$PG_PASS';"

su-exec postgres psql -h 127.0.0.1 -p 5432 -U postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" | grep -q 1 || \
  su-exec postgres psql -h 127.0.0.1 -p 5432 -U postgres -c \
    "CREATE DATABASE $PG_DB OWNER $PG_USER;"

export DATABASE_URL="postgresql://$PG_USER:$PG_PASS@127.0.0.1:5432/$PG_DB"

# ─── Migrations ───────────────────────────────────────────────────────────────
PRISMA="node node_modules/prisma/build/index.js"
echo "📦 Running database migrations..."
$PRISMA migrate deploy

touch "$DATA_DIR/.initialized"

# ─── Graceful shutdown ────────────────────────────────────────────────────────
shutdown() {
  echo "🛑 Shutting down..."
  kill -TERM "$APP_PID" 2>/dev/null || true
  wait "$APP_PID" 2>/dev/null || true
  su-exec postgres pg_ctl -D "$PG_DATA" stop -m fast 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

# ─── Start application ────────────────────────────────────────────────────────
echo "🚀 Starting KanbanFlow on port ${PORT:-3000}..."
su-exec nextjs node server.js &
APP_PID=$!
wait "$APP_PID"
