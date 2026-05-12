import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { isFullSetup } from "@/lib/features";
import { BulkTicketForm } from "@/components/helpdesk/BulkTicketForm";

export default async function BulkTicketPage() {
  if (!isFullSetup) notFound();

  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) notFound();

  const [queues, teams, orgUsers] = await Promise.all([
    prisma.ticketQueue.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: "asc" } }),
    prisma.ticketTeam.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: "asc" } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-5xl mx-auto animate-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Mehrere Tickets erstellen</h1>
        <p className="text-sm text-muted-foreground mt-1">Füge Zeilen hinzu und erstelle alle Tickets auf einmal.</p>
      </div>
      <BulkTicketForm queues={queues} teams={teams} orgUsers={orgUsers} currentUserId={session.userId} />
    </div>
  );
}
