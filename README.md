# KanbanFlow

A production-ready, multi-user Kanban board — a local-first alternative to awork/Trello.

## Features

- **Auth** — Register, login, logout (JWT + bcrypt, httpOnly cookie)
- **Workspaces** — Multiple workspaces per user, role-based access (Owner / Admin / Member / Viewer)
- **Projects** — Per-workspace projects with status tracking
- **Kanban Board** — Drag & Drop columns and tasks ([@dnd-kit](https://dndkit.com/))
- **Tasks** — Title, description, priority, due date, assignee, labels, checklist, comments, activity log
- **Dashboard** — Personal stats, my tasks, upcoming/overdue tasks
- **Server Actions** — All mutations via Next.js Server Actions with server-side auth checks

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui components |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | Custom JWT (jose) + bcryptjs |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Notifications | sonner |

## Setup

### 1. Clone and install

```bash
cd kanban-board
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/kanban_board"
JWT_SECRET="your-super-secret-jwt-key-min-32-characters-long"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Start PostgreSQL

Using Docker:

```bash
docker run -d \
  --name kanban-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=kanban_board \
  -p 5432:5432 \
  postgres:16-alpine
```

Or use your local PostgreSQL installation and create the database:

```sql
CREATE DATABASE kanban_board;
```

### 4. Run migrations

```bash
npx prisma migrate dev --name init
```

### 5. Seed demo data

```bash
npx prisma db seed
```

### 6. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Login

| Role | Email | Password |
|---|---|---|
| Owner / Admin | admin@demo.com | demo1234 |
| Member | user@demo.com | demo1234 |

## Project Structure

```
kanban-board/
├── app/
│   ├── (auth)/           # Login, Register (no sidebar)
│   │   ├── login/
│   │   └── register/
│   ├── (app)/            # Protected routes (with sidebar)
│   │   ├── dashboard/
│   │   ├── workspaces/
│   │   │   └── [workspaceId]/
│   │   │       ├── page.tsx          # Project list
│   │   │       ├── settings/         # Workspace settings + members
│   │   │       └── projects/
│   │   │           └── [projectId]/
│   │   │               └── board/    # Kanban board
│   │   └── settings/                 # User profile
│   └── api/
│       └── tasks/[taskId]/           # Task detail API
├── actions/              # Next.js Server Actions
│   ├── auth.ts
│   ├── workspace.ts
│   ├── project.ts
│   ├── task.ts
│   ├── column.ts
│   └── user.ts
├── components/
│   ├── board/            # BoardView, BoardColumn, TaskCard, TaskDialog
│   ├── forms/            # Login/Register/Create forms
│   ├── layout/           # Sidebar, Topbar
│   ├── settings/         # UserSettingsClient
│   ├── ui/               # shadcn-style base components
│   └── workspace/        # Workspace-specific components
├── lib/
│   ├── auth.ts           # JWT session management
│   ├── permissions.ts    # Server-side role checks
│   ├── prisma.ts         # PrismaClient singleton
│   ├── utils.ts          # Helpers, color maps
│   └── validations/      # Zod schemas
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
└── types/
```

## Security

- All mutations validated server-side with Zod
- Session verified on every Server Action and API route
- Role-based access: OWNER > ADMIN > MEMBER > VIEWER
- Workspace isolation: users cannot access other workspaces' data
- Passwords hashed with bcrypt (cost factor 12)
- JWT in httpOnly cookie (not accessible from JavaScript)

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed demo data
npm run db:studio    # Open Prisma Studio (DB GUI)
```
