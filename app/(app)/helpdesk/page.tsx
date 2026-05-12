import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { isFullSetup } from "@/lib/features";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketList } from "@/components/helpdesk/TicketList";
import { EmailCheckButton } from "@/components/helpdesk/EmailCheckButton";

export default async function HelpdeskPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; queue?: string; q?: string }>;
}) {
  if (!isFullSetup) notFound();

  const session = await requireSession();
  const { status, priority, queue, q } = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) notFound();

  const [tickets, queues, exchangeConfig, orgUsers] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        organizationId: user.organizationId,
        ...(status ? { status: status as never } : {}),
        ...(priority ? { priority: priority as never } : {}),
        ...(queue ? { queueId: queue } : {}),
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        queue: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.ticketQueue.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { position: "asc" },
    }),
    prisma.exchangeConfig.findUnique({
      where: { organizationId: user.organizationId },
      select: { enabled: true, lastCheckedAt: true },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col h-full animate-in">
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Helpdesk</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tickets.length} Tickets · {tickets.filter((t) => t.status === "OPEN").length} offen
          </p>
        </div>
        <div className="flex items-center gap-2">
          {exchangeConfig?.enabled && <EmailCheckButton lastChecked={exchangeConfig.lastCheckedAt} />}
          <Button asChild size="sm">
            <Link href="/helpdesk/new">
              <Plus className="h-4 w-4 mr-1" /> Neues Ticket
            </Link>
          </Button>
        </div>
      </div>

      <TicketList
        tickets={tickets}
        queues={queues}
        orgUsers={orgUsers}
        currentFilters={{ status, priority, queue, q }}
        isAdmin={user.isAdmin}
      />
    </div>
  );
}
