import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { isFullSetup } from "@/lib/features";
import { TicketForm } from "@/components/helpdesk/TicketForm";

export default async function NewTicketPage() {
  if (!isFullSetup) notFound();

  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) notFound();

  const [queues, orgUsers] = await Promise.all([
    prisma.ticketQueue.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { position: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="max-w-2xl mx-auto animate-in">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Neues Ticket</h1>
      <TicketForm queues={queues} orgUsers={orgUsers} currentUserId={session.userId} />
    </div>
  );
}
