# KanbanFlow

A production-ready, multi-user Kanban board built with Next.js, PostgreSQL and Docker.

## Features

- **First-run setup** — Admin account creation on first launch (no hardcoded credentials)
- **User approval** — New registrations require admin approval before access
- **Workspaces & Projects** — Multi-workspace with role-based access (Owner / Admin / Member / Viewer)
- **Sections / Teams** — Divide projects into sections (e.g. "Basis IT", "Klinische IT")
- **Kanban Board** — Drag & Drop with @dnd-kit, positions stored in PostgreSQL
- **Tasks** — Priority, due date, assignee, labels, checklist, comments, activity log, attachments
- **Dark / Light mode** — Individual preference stored in cookie
- **Internationalisation** — UI available in English, German, French and Spanish; language selectable per user
- **Profile pictures** — Users can upload a personal profile picture
- **Company logo** — Admin can upload a logo shown in the sidebar header
- **Security** — Rate limiting, bcrypt, JWT httpOnly cookies, server-side auth on every action

---

## Option A — Docker (recommended)

No local PostgreSQL needed. Everything runs in containers.

```bash
# 1. Copy and fill in secrets
cp .env.docker.example .env.docker
# Edit DB_PASSWORD and JWT_SECRET (min 32 chars)
# Tip: openssl rand -base64 48

# 2. Start
docker compose --env-file .env.docker up -d

# 3. Open http://localhost:3000 → /setup → create admin account
```

**Update to a new version:**
```bash
docker compose --env-file .env.docker pull
docker compose --env-file .env.docker up -d
# Database data is preserved automatically (Docker volume)
```

> ⚠️ Never run `docker compose down -v` — the `-v` flag deletes all data.

---

## Option B — Local Development

Requires Docker for PostgreSQL (or any running PostgreSQL instance).

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL via Docker + run migrations automatically
npm run db:start
npx prisma migrate dev

# 3. Configure environment
cp .env.example .env
# Edit .env with your values

# 4. Start dev server
npm run dev

# 5. Open http://localhost:3000 → /setup → create admin account
```

**Environment variables:**
```env
DATABASE_URL="postgresql://kanban:kanban@localhost:5432/kanban_board"
JWT_SECRET="your-secret-min-32-chars"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## Project Structure

```
├── app/
│   ├── (auth)/          login, register
│   ├── (app)/           protected routes with sidebar
│   │   ├── admin/       user management + logo (admin only)
│   │   ├── dashboard/
│   │   ├── workspaces/
│   │   └── settings/    profile picture, language, password
│   ├── setup/           first-run admin creation
│   └── pending/         approval waiting page
├── actions/             Next.js Server Actions (all auth-checked)
├── components/
│   ├── board/           BoardView, TaskCard, TaskDialog, DnD
│   ├── admin/           UserManagementTable, LogoUpload
│   ├── settings/        UserSettingsClient
│   └── layout/          Sidebar, Topbar, ThemeToggle
├── lib/                 auth, prisma, permissions, ratelimit
├── messages/            i18n translations (en, de, fr, es)
├── prisma/              schema + migrations
└── scripts/             Docker entrypoint
```

## Useful Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run db:start     # Start local PostgreSQL via Docker
npm run db:stop      # Stop local PostgreSQL
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio (DB GUI)
```
