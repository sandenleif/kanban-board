import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMember } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { canAdmin } from "@/lib/utils";
import { WorkspaceSettingsClient } from "@/components/workspace/WorkspaceSettingsClient";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const session = await requireSession();

  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member) notFound();

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return (
    <div className="max-w-3xl mx-auto animate-in">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Workspace Settings</h1>
      <WorkspaceSettingsClient
        workspace={member.workspace}
        members={members}
        currentUserId={session.userId}
        userRole={member.role}
        canAdmin={canAdmin(member.role)}
      />
    </div>
  );
}
