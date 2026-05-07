export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession, clearSession } from "@/lib/auth";
import { OrgTable } from "@/components/super-admin/OrgTable";
import { logoutAction } from "@/actions/auth";
import { Building2, Users, FolderKanban, ShieldCheck } from "lucide-react";

export default async function SuperAdminPage() {
  const session = await requireSession();
  if (!session.isSuperAdmin) redirect("/dashboard");

  const [orgs, totalUsers, totalWorkspaces] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { users: true, workspaces: true } },
      },
    }),
    prisma.user.count({ where: { isSuperAdmin: false } }),
    prisma.workspace.count(),
  ]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
              <rect x="1" y="1" width="5" height="14" rx="1" fill="currentColor" />
              <rect x="8" y="1" width="5" height="9" rx="1" fill="currentColor" opacity="0.7" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">KanbanFlow</span>
              <span className="text-xs font-semibold text-primary border border-primary/30 rounded px-1.5 py-0.5">Enterprise</span>
            </div>
            <p className="text-xs text-muted-foreground">Super Admin Panel</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {session.name}
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage all organizations on this platform</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Organizations", value: orgs.length, icon: Building2, color: "text-blue-400", bg: "bg-blue-400/10" },
            { label: "Total users", value: totalUsers, icon: Users, color: "text-green-400", bg: "bg-green-400/10" },
            { label: "Total workspaces", value: totalWorkspaces, icon: FolderKanban, color: "text-purple-400", bg: "bg-purple-400/10" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Register link */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">All organizations</h2>
          <a
            href="/register/org"
            className="text-sm text-primary hover:underline font-medium"
          >
            + New organization
          </a>
        </div>

        <OrgTable orgs={orgs} />
      </main>
    </div>
  );
}
