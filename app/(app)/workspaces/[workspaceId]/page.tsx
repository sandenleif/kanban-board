import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMember } from "@/lib/permissions";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectActionsMenu } from "@/components/workspace/ProjectActionsMenu";
import { CreateProjectButton } from "@/components/workspace/CreateProjectButton";
import { FolderKanban, Clock, CheckCircle2, Archive, Users } from "lucide-react";
import { formatDate, canEdit } from "@/lib/utils";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const session = await requireSession();

  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member) notFound();

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { sections: true } },
      sections: {
        include: {
          _count: { select: { columns: true } },
          columns: {
            include: { _count: { select: { tasks: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const workspace = member.workspace;
  const userCanEdit = canEdit(member.role);

  return (
    <div className="max-w-5xl mx-auto animate-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{workspace.name}</h1>
          {workspace.description && (
            <p className="text-muted-foreground text-sm mt-1">{workspace.description}</p>
          )}
        </div>
        {userCanEdit && <CreateProjectButton workspaceId={workspaceId} />}
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="p-16 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-foreground font-medium">No projects yet</p>
            <p className="text-muted-foreground text-sm mt-1 mb-4">
              Create your first project to get started with the Kanban board.
            </p>
            {userCanEdit && <CreateProjectButton workspaceId={workspaceId} />}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const totalTasks = project.sections
              .flatMap((s) => s.columns)
              .reduce((sum, col) => sum + col._count.tasks, 0);
            const doneTasks = project.sections
              .flatMap((s) => s.columns)
              .filter((c) => c.name === "Done")
              .reduce((sum, col) => sum + col._count.tasks, 0);

            return (
              <Card key={project.id} className="hover:border-primary/30 transition-colors group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                        project.status === "ACTIVE"
                          ? "bg-green-400/10 text-green-400"
                          : project.status === "ARCHIVED"
                          ? "bg-slate-400/10 text-slate-400"
                          : "bg-blue-400/10 text-blue-400"
                      }`}
                    >
                      {project.status === "ACTIVE" && <CheckCircle2 className="h-3 w-3" />}
                      {project.status === "ARCHIVED" && <Archive className="h-3 w-3" />}
                      {project.status}
                    </div>
                    {userCanEdit && (
                      <ProjectActionsMenu
                        project={project}
                        workspaceId={workspaceId}
                        userRole={member.role}
                      />
                    )}
                  </div>

                  <Link
                    href={`/workspaces/${workspaceId}/projects/${project.id}/board`}
                    className="block"
                  >
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {project.name}
                    </h3>
                    {project.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {project.description}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {project._count.sections} section
                        {project._count.sections !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <FolderKanban className="h-3.5 w-3.5" />
                        {totalTasks} task{totalTasks !== 1 ? "s" : ""}
                        {totalTasks > 0 && ` · ${doneTasks} done`}
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
}
