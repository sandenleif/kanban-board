import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMember } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { BoardView } from "@/components/board/BoardView";
import { canEdit } from "@/lib/utils";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const session = await requireSession();

  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member) notFound();

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    include: {
      sections: {
        orderBy: { position: "asc" },
        include: {
          columns: {
            orderBy: { position: "asc" },
            include: {
              tasks: {
                orderBy: { position: "asc" },
                include: {
                  assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
                  createdBy: { select: { id: true, name: true } },
                  labels: { include: { label: true } },
                  _count: { select: { comments: true, checklist: true } },
                },
              },
            },
          },
        },
      },
      labels: true,
    },
  });

  if (!project) notFound();

  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-background shrink-0">
        <Link
          href={`/workspaces/${workspaceId}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {member.workspace.name}
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{project.name}</span>
        {project.status !== "ACTIVE" && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground ml-2">
            {project.status}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <BoardView
          project={project}
          workspaceId={workspaceId}
          canEdit={canEdit(member.role)}
          currentUserId={session.userId}
          workspaceMembers={workspaceMembers.map((m) => m.user)}
        />
      </div>
    </div>
  );
}
