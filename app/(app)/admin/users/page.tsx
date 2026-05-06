import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, CheckCircle2, Ban } from "lucide-react";

export default async function AdminUsersPage() {
  const session = await requireSession();

  const currentUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });

  if (!currentUser?.isAdmin) notFound();

  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      isAdmin: true,
      createdAt: true,
      _count: { select: { workspaceMembers: true } },
    },
  });

  const pending = users.filter((u) => u.status === "PENDING").length;
  const active = users.filter((u) => u.status === "ACTIVE").length;
  const suspended = users.filter((u) => u.status === "SUSPENDED").length;

  return (
    <div className="max-w-5xl mx-auto animate-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Approve, suspend, or manage all registered users.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Pending approval", value: pending, icon: Clock, color: "text-yellow-400", bg: "bg-yellow-400/10" },
          { label: "Active users", value: active, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10" },
          { label: "Suspended", value: suspended, icon: Ban, color: "text-red-400", bg: "bg-red-400/10" },
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

      <UserManagementTable users={users} currentUserId={session.userId} />
    </div>
  );
}
