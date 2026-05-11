import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { User } from "lucide-react";
import { PersonalChecklist } from "@/components/personal/PersonalChecklist";
import { PersonalNotesPanel } from "@/components/notes/PersonalNotesPanel";

export default async function PersonalSpacePage() {
  const session = await requireSession();

  const [space, allWorkspaceMemberships] = await Promise.all([
    prisma.personalSpace.findUnique({
      where: { userId: session.userId },
      include: {
        personalChecklistCategories: {
          orderBy: { position: "asc" },
          include: {
            items: {
              orderBy: { position: "asc" },
              include: { subItems: { orderBy: { position: "asc" } } },
            },
          },
        },
        personalNotes: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, content: true, priority: true, position: true },
        },
      },
    }),
    prisma.workspaceMember.findMany({
      where: { userId: session.userId },
      include: {
        workspace: {
          include: {
            projects: {
              where: { status: "ACTIVE" },
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
  ]);

  const allWorkspaces = allWorkspaceMemberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    projects: m.workspace.projects,
  }));

  return (
    <div className="flex flex-col h-full animate-in">
      <div className="flex items-center gap-3 mb-5 shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Persönlicher Bereich</h1>
          <p className="text-muted-foreground text-sm">Deine privaten Notizen und Checklisten</p>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left: Checklist */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Checkliste</h2>
          <PersonalChecklist categories={space?.personalChecklistCategories ?? []} />
        </div>

        {/* Right: Notes */}
        <div className="w-80 shrink-0 flex flex-col max-h-[calc(100vh-180px)]">
          <PersonalNotesPanel
            notes={space?.personalNotes ?? []}
            allWorkspaces={allWorkspaces}
          />
        </div>
      </div>
    </div>
  );
}
