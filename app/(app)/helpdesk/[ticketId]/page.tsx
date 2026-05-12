import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { isFullSetup } from "@/lib/features";
import { TicketDetail } from "@/components/helpdesk/TicketDetail";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  if (!isFullSetup) notFound();

  const session = await requireSession();
  const { ticketId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) notFound();

  const [ticket, queues, orgUsers, workspaceMemberships] = await Promise.all([
    prisma.ticket.findFirst({
      where: { id: ticketId, organizationId: user.organizationId },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        lockedBy: { select: { id: true, name: true } },
        queue: { select: { id: true, name: true } },
        comments: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.ticketQueue.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { position: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
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

  if (!ticket) notFound();

  const allWorkspaces = workspaceMemberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    projects: m.workspace.projects,
  }));

  return (
    <TicketDetail
      ticket={ticket}
      queues={queues}
      orgUsers={orgUsers}
      allWorkspaces={allWorkspaces}
      currentUserId={session.userId}
      isAdmin={user.isAdmin}
    />
  );
}
