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
su-exec postgres pg_ctl -D "$PG_DATA" \
  -o "-h 127.0.0.1 -p 5432 -c unix_socket_directories=''" \
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

# ─── Schema migration helper ─────────────────────────────────────────────────
PG="su-exec postgres psql -h 127.0.0.1 -p 5432 -U postgres -d $PG_DB"

# If upgrading from pre-enterprise schema: create organizations table and
# backfill organizationId on existing rows before prisma db push runs.
ORG_TABLE_EXISTS=$($PG -tAc "SELECT to_regclass('public.organizations')" 2>/dev/null || echo "")
if [ -z "$ORG_TABLE_EXISTS" ] || [ "$ORG_TABLE_EXISTS" = "" ]; then
  HAS_APP_SETTINGS=$($PG -tAc "SELECT to_regclass('public.app_settings')" 2>/dev/null || echo "")
  if [ -n "$HAS_APP_SETTINGS" ] && [ "$HAS_APP_SETTINGS" != "" ]; then
    echo "🔄 Upgrading schema to enterprise layout (no data loss)..."
    $PG -c "
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      INSERT INTO organizations (id, name, slug)
        VALUES ('default-org', 'Default', 'default')
        ON CONFLICT DO NOTHING;
      ALTER TABLE app_settings
        ADD COLUMN IF NOT EXISTS organization_id TEXT;
      UPDATE app_settings SET organization_id = 'default-org' WHERE organization_id IS NULL;
      ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS organization_id TEXT;
      UPDATE workspaces SET organization_id = 'default-org' WHERE organization_id IS NULL;
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS organization_id TEXT,
        ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE users SET organization_id = 'default-org' WHERE organization_id IS NULL;
    " 2>/dev/null || true
    echo "✅ Schema upgrade complete"
  fi
fi

# ─── Migrations ───────────────────────────────────────────────────────────────
PRISMA="node node_modules/prisma/build/index.js"
echo "📦 Pushing schema to database..."
$PRISMA db push --skip-generate --accept-data-loss

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
