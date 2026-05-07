"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { suspendOrgAction, activateOrgAction, deleteOrgAction } from "@/actions/organization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, FolderKanban, Ban, CheckCircle2, Trash2, Copy } from "lucide-react";
import { formatDate } from "@/lib/utils";

type Org = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  _count: { users: number; workspaces: number };
};

export function OrgTable({ orgs }: { orgs: Org[] }) {
  const [isPending, startTransition] = useTransition();

  const handleSuspend = (id: string) => {
    startTransition(async () => {
      const r = await suspendOrgAction(id);
      if (r.error) toast.error(r.error);
      else toast.success("Organization suspended");
    });
  };

  const handleActivate = (id: string) => {
    startTransition(async () => {
      const r = await activateOrgAction(id);
      if (r.error) toast.error(r.error);
      else toast.success("Organization activated");
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its data permanently?`)) return;
    startTransition(async () => {
      const r = await deleteOrgAction(id);
      if (r.error) toast.error(r.error);
      else toast.success("Organization deleted");
    });
  };

  const copyRegLink = (slug: string) => {
    const url = `${window.location.origin}/register?org=${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Registration link copied");
  };

  if (orgs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-16 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-foreground font-medium">No organizations yet</p>
        <p className="text-muted-foreground text-sm mt-1">
          Organizations register at <a href="/register/org" className="text-primary hover:underline">/register/org</a>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Organization</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Slug</th>
            <th className="text-center px-4 py-3 font-medium text-muted-foreground">Users</th>
            <th className="text-center px-4 py-3 font-medium text-muted-foreground">Workspaces</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orgs.map((org) => (
            <tr key={org.id} className="bg-card hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-medium text-foreground">{org.name}</td>
              <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{org.slug}</td>
              <td className="px-4 py-3 text-center">
                <span className="flex items-center justify-center gap-1 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {org._count.users}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span className="flex items-center justify-center gap-1 text-muted-foreground">
                  <FolderKanban className="h-3.5 w-3.5" />
                  {org._count.workspaces}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(org.createdAt)}</td>
              <td className="px-4 py-3">
                <Badge variant={org.status === "ACTIVE" ? "default" : "destructive"} className="text-xs">
                  {org.status}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 justify-end">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => copyRegLink(org.slug)}
                    title="Copy registration link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {org.status === "ACTIVE" ? (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-yellow-500 hover:text-yellow-500"
                      onClick={() => handleSuspend(org.id)}
                      disabled={isPending}
                      title="Suspend"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:text-green-500"
                      onClick={() => handleActivate(org.id)}
                      disabled={isPending}
                      title="Activate"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(org.id, org.name)}
                    disabled={isPending}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
