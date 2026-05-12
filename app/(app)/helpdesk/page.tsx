export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { isFullSetup } from "@/lib/features";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketList } from "@/components/helpdesk/TicketList";
import { HelpdeskOverview } from "@/components/helpdesk/HelpdeskOverview";
import { EmailCheckButton } from "@/components/helpdesk/EmailCheckButton";

export default async function HelpdeskPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; priority?: string; queue?: string; team?: string; topic?: string; inventoryNumber?: string; q?: string; page?: string }>;
}) {
  if (!isFullSetup) notFound();

  const session = await requireSession();
  const { view, status, priority, queue, team, topic, inventoryNumber, q, page } = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) notFound();

  const orgId = user.organizationId;
  const LIMIT = 25;
  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const isListView = view === "list";

  const [queues, teams, exchangeConfig, orgUsers, stats] = await Promise.all([
    prisma.ticketQueue.findMany({ where: { organizationId: orgId }, orderBy: { position: "asc" } }),
    prisma.ticketTeam.findMany({ where: { organizationId: orgId }, orderBy: { position: "asc" } }),
    prisma.exchangeConfig.findUnique({ where: { organizationId: orgId }, select: { enabled: true, lastCheckedAt: true } }),
    prisma.user.findMany({ where: { organizationId: orgId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.ticket.groupBy({ by: ["status"], where: { organizationId: orgId }, _count: { id: true } }),
  ]);

  const statusMap = Object.fromEntries(stats.map((s) => [s.status, s._count.id]));
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const escalationThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [created7, closed7, escalatedTickets, newTickets, inProgressTickets] = await Promise.all([
    prisma.ticket.findMany({ where: { organizationId: orgId, createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true } }),
    prisma.ticket.findMany({ where: { organizationId: orgId, closedAt: { gte: sevenDaysAgo } }, select: { closedAt: true } }),
    prisma.ticket.findMany({
      where: { organizationId: orgId, status: { in: ["OPEN", "IN_PROGRESS"] }, createdAt: { lt: escalationThreshold } },
      include: { queue: { select: { name: true } }, assignedTo: { select: { name: true } }, createdBy: { select: { name: true } }, lockedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" }, take: 10,
    }),
    prisma.ticket.findMany({
      where: { organizationId: orgId, status: "OPEN" },
      include: { queue: { select: { name: true } }, assignedTo: { select: { name: true } }, createdBy: { select: { name: true } }, lockedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: 10,
    }),
    prisma.ticket.findMany({
      where: { organizationId: orgId, status: "IN_PROGRESS" },
      include: { queue: { select: { name: true } }, assignedTo: { select: { name: true } }, createdBy: { select: { name: true } }, lockedBy: { select: { name: true } } },
      orderBy: { updatedAt: "desc" }, take: 5,
    }),
  ]);

  const whereClause = {
    organizationId: orgId,
    ...(status ? { status: status as never } : {}),
    ...(priority ? { priority: priority as never } : {}),
    ...(queue ? { queueId: queue } : {}),
    ...(team ? { teamId: team } : {}),
    ...(topic ? { topic: { contains: topic, mode: "insensitive" as const } } : {}),
    ...(inventoryNumber ? { inventoryNumber: { contains: inventoryNumber, mode: "insensitive" as const } } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q, mode: "insensitive" as const } },
        { topic: { contains: q, mode: "insensitive" as const } },
        { inventoryNumber: { contains: q, mode: "insensitive" as const } },
        { fromEmail: { contains: q, mode: "insensitive" as const } },
        { fromName: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [tickets, totalTickets] = isListView ? await Promise.all([
    prisma.ticket.findMany({
      where: whereClause,
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        lockedBy: { select: { id: true, name: true } },
        queue: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * LIMIT,
      take: LIMIT,
    }),
    prisma.ticket.count({ where: whereClause }),
  ]) : [[], 0];

  return (
    <div className="flex flex-col h-full animate-in">
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Helpdesk</h1>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            <Link href="/helpdesk" className={`px-3 py-1.5 transition-colors ${!isListView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              Übersicht
            </Link>
            <Link href="/helpdesk?view=list" className={`px-3 py-1.5 transition-colors ${isListView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              Alle Tickets
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {exchangeConfig?.enabled && <EmailCheckButton lastChecked={exchangeConfig.lastCheckedAt} />}
          <Button asChild size="sm" variant="outline">
            <Link href="/helpdesk/bulk">Mehrere erstellen</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/helpdesk/new"><Plus className="h-4 w-4" /> Neues Ticket</Link>
          </Button>
        </div>
      </div>

      {isListView ? (
        <TicketList
          tickets={tickets}
          queues={queues}
          teams={teams}
          orgUsers={orgUsers}
          currentFilters={{ status, priority, queue, team, topic, inventoryNumber, q }}
          isAdmin={user.isAdmin}
          totalCount={totalTickets}
          page={pageNum}
          limit={LIMIT}
        />
      ) : (
        <HelpdeskOverview
          statusMap={statusMap}
          escalatedTickets={escalatedTickets}
          newTickets={newTickets}
          inProgressTickets={inProgressTickets}
          created7={created7.map((t) => t.createdAt)}
          closed7={closed7.map((t) => t.closedAt!)}
        />
      )}
    </div>
  );
}
