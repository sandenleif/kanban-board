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

  const [ticket, queues, teams, orgUsers, workspaceMemberships] = await Promise.all([
    prisma.ticket.findFirst({
      where: { id: ticketId, organizationId: user.organizationId },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        lockedBy: { select: { id: true, name: true } },
        queue: { select: { id: true, name: true } },
        team:  { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, email: true, phone: true, company: true, department: true, source: true, notes: true } },
        comments: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.ticketQueue.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: "asc" } }),
    prisma.ticketTeam.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: "asc" } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.workspaceMember.findMany({
      where: { userId: session.userId },
      include: { workspace: { include: { projects: { where: { status: "ACTIVE" }, select: { id: true, name: true } } } } },
    }),
  ]);

  if (!ticket) notFound();

  const allWorkspaces = workspaceMemberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    projects: m.workspace.projects,
  }));

  // Load agent hardware data if ticket has an inventoryNumber (PC hostname)
  const agent = ticket.inventoryNumber
    ? await prisma.softwareAgent.findFirst({
        where: { organizationId: user.organizationId, hostname: { equals: ticket.inventoryNumber, mode: "insensitive" } },
        select: {
          id: true, hostname: true, ipAddress: true, osVersion: true,
          cpuName: true, cpuCores: true, ramGb: true, diskGb: true,
          manufacturer: true, model: true, agentVersion: true, lastSeenAt: true,
          asset: { select: { name: true } },
        },
      })
    : null;

  return (
    <TicketDetail
      ticket={ticket}
      queues={queues}
      teams={teams}
      orgUsers={orgUsers}
      allWorkspaces={allWorkspaces}
      currentUserId={session.userId}
      isAdmin={user.isAdmin}
      agent={agent ?? null}
    />
  );
}
