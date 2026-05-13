import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMember } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { canEdit } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AworkImport } from "@/components/workspace/AworkImport";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const session = await requireSession();

  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member) notFound();
  if (!canEdit(member.role)) notFound();

  const projects = await prisma.project.findMany({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-2xl mx-auto animate-in">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/workspaces/${workspaceId}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {member.workspace.name}
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-foreground mb-1">Awork Import</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Importiert Tasks aus einer Awork-XLSX-Exportdatei in ein Projekt dieses Workspaces.
        Status-Typen werden automatisch den passenden Spalten zugeordnet.
      </p>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Kein aktives Projekt im Workspace vorhanden.</p>
          <p className="text-sm text-muted-foreground mt-1">Bitte zuerst ein Projekt anlegen.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {projects.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-medium text-foreground mb-3">Zielprojekt wählen</p>
              <div className="space-y-2">
                {projects.map((p) => (
                  <Link key={p.id} href={`/workspaces/${workspaceId}/import?project=${p.id}`}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:border-primary/30 transition-colors text-sm">
                    {p.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-5">
            <AworkImport projectId={projects[0].id} workspaceId={workspaceId} />
          </div>
        </div>
      )}
    </div>
  );
}
