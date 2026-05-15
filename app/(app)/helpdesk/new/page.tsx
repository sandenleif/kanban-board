import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { isFullSetup } from "@/lib/features";
import { TicketForm } from "@/components/helpdesk/TicketForm";
import { elasticEnabled } from "@/lib/elasticsearch";

export default async function NewTicketPage() {
  if (!isFullSetup) notFound();

  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) notFound();

  const [queues, teams, categories, orgUsers] = await Promise.all([
    prisma.ticketQueue.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: "asc" } }),
    prisma.ticketTeam.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: "asc" } }),
    prisma.ticketCategory.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: "asc" } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-4xl mx-auto animate-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Neues Ticket</h1>
      </div>
      <TicketForm queues={queues} teams={teams} categories={categories} orgUsers={orgUsers} currentUserId={session.userId} hasElastic={elasticEnabled} />
    </div>
  );
}
