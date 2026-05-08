import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMember } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectActionsMenu } from "@/components/workspace/ProjectActionsMenu";
import { CreateProjectButton } from "@/components/workspace/CreateProjectButton";
import { WorkspaceChecklist } from "@/components/workspace/WorkspaceChecklist";
import { WorkspaceNote } from "@/components/workspace/WorkspaceNote";
import { WorkspaceTabs } from "@/components/workspace/WorkspaceTabs";
import { FolderKanban, Clock, CheckCircle2, Archive, Users, Settings } from "lucide-react";
import { formatDate, canEdit, canAdmin } from "@/lib/utils";

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await requireSession();
  const t = await getTranslations("workspace");

  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member) notFound();

  const [projects, checklistCategories, workspaceNote, allWorkspaceMemberships] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId },
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { sections: true } },
        sections: {
          include: {
            _count: { select: { columns: true } },
            columns: { include: { _count: { select: { tasks: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workspaceChecklistCategory.findMany({
      where: { workspaceId },
      orderBy: { position: "asc" },
      include: {
        items: {
          orderBy: { position: "asc" },
          include: { subItems: { orderBy: { position: "asc" } } },
        },
      },
    }),
    prisma.workspaceNote.findUnique({ where: { workspaceId }, select: { content: true } }),
    prisma.workspaceMember.findMany({
      where: { userId: session.userId },
      include: {
        workspace: {
          include: {
            projects: {
              where: { status: "ACTIVE" },
              select: { id: true, name: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    }),
  ]);

  const workspace = member.workspace;
  const userCanEdit = canEdit(member.role);
  const userCanAdmin = canAdmin(member.role);

  const allWorkspaces = allWorkspaceMemberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    projects: m.workspace.projects,
  }));

  const projectsContent = (
    <div>
      {projects.length === 0 ? (
        <Card>
          <CardContent className="p-16 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-foreground font-medium">{t("noProjects")}</p>
            <p className="text-muted-foreground text-sm mt-1 mb-4">{t("noProjectsHint")}</p>
            {userCanEdit && <CreateProjectButton workspaceId={workspaceId} />}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const totalTasks = project.sections.flatMap((s) => s.columns).reduce((sum, col) => sum + col._count.tasks, 0);
            const doneTasks = project.sections.flatMap((s) => s.columns).filter((c) => c.name === "Done").reduce((sum, col) => sum + col._count.tasks, 0);

            return (
              <Card key={project.id} className="hover:border-primary/30 transition-colors group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                      project.status === "ACTIVE" ? "bg-green-400/10 text-green-400"
                      : project.status === "ARCHIVED" ? "bg-slate-400/10 text-slate-400"
                      : "bg-blue-400/10 text-blue-400"
                    }`}>
                      {project.status === "ACTIVE" && <CheckCircle2 className="h-3 w-3" />}
                      {project.status === "ARCHIVED" && <Archive className="h-3 w-3" />}
                      {project.status}
                    </div>
                    {userCanEdit && (
                      <ProjectActionsMenu project={project} workspaceId={workspaceId} userRole={member.role} />
                    )}
                  </div>

                  <Link href={`/workspaces/${workspaceId}/projects/${project.id}/board`} className="block">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
                    )}

                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {project._count.sections}
                      </span>
                      <span className="flex items-center gap-1">
                        <FolderKanban className="h-3.5 w-3.5" />
                        {totalTasks}
                        {totalTasks > 0 && ` · ${doneTasks} ${t("done")}`}
                      </span>
                      <span className="flex items-center gap-1 ml-auto">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(project.updatedAt)}
                      </span>
                    </div>

                    {totalTasks > 0 && (
                      <div className="mt-3 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/70 transition-all"
                          style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%` }}
                        />
                      </div>
                    )}
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const checklistContent = (
    <WorkspaceChecklist
      workspaceId={workspaceId}
      categories={checklistCategories}
      allWorkspaces={allWorkspaces}
      canEdit={userCanEdit}
    />
  );

  const noteContent = (
    <WorkspaceNote
      workspaceId={workspaceId}
      initialContent={workspaceNote?.content ?? null}
      canEdit={userCanEdit}
    />
  );

  return (
    <div className="flex flex-col h-full animate-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{workspace.name}</h1>
          {workspace.description && (
            <p className="text-muted-foreground text-sm mt-1">{workspace.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {userCanAdmin && (
            <Link
              href={`/workspaces/${workspaceId}/settings`}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Settings className="h-4 w-4" />
              {t("settingsTitle")}
            </Link>
          )}
          {userCanEdit && <CreateProjectButton workspaceId={workspaceId} />}
        </div>
      </div>

      <WorkspaceTabs
        projectsContent={projectsContent}
        checklistContent={checklistContent}
        noteContent={noteContent}
      />
    </div>
  );
}
