export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { isFullSetup } from "@/lib/features";
import { ContactsClient } from "@/components/helpdesk/ContactsClient";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string }>;
}) {
  if (!isFullSetup) notFound();

  const session = await requireSession();
  const { q, source } = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) notFound();

  const contacts = await prisma.ticketContact.findMany({
    where: {
      organizationId: user.organizationId,
      ...(source ? { source } : {}),
      ...(q ? {
        OR: [
          { name:       { contains: q, mode: "insensitive" } },
          { email:      { contains: q, mode: "insensitive" } },
          { company:    { contains: q, mode: "insensitive" } },
          { department: { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    },
    include: { _count: { select: { tickets: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col h-full animate-in">
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kunden</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contacts.length} Kontakte</p>
        </div>
      </div>
      <ContactsClient
        contacts={contacts}
        currentFilters={{ q, source }}
        isAdmin={user.isAdmin}
      />
    </div>
  );
}
