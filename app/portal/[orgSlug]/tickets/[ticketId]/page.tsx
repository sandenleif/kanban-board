export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { notFound } from "next/navigation";
import { PortalTicketDetail } from "@/components/portal/PortalTicketDetail";

export default async function PortalTicketPage({
  params,
}: {
  params: Promise<{ orgSlug: string; ticketId: string }>;
}) {
  const { orgSlug, ticketId } = await params;
  const session = await requirePortalSession(orgSlug);

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true, status: true, settings: { select: { logoBase64: true, logoMimeType: true, siteTitle: true } } },
  });
  if (!org || org.status !== "ACTIVE") notFound();

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId: org.id, fromEmail: session.email },
    include: {
      category: { select: { name: true } },
      queue:    { select: { name: true } },
      assignedTo: { select: { name: true } },
      comments: {
        where: { isInternal: false },
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) notFound();

  const logoSrc = org.settings?.logoBase64 && org.settings.logoMimeType
    ? `data:${org.settings.logoMimeType};base64,${org.settings.logoBase64}`
    : null;

  return (
    <PortalTicketDetail
      ticket={ticket}
      session={session}
      orgSlug={orgSlug}
      orgName={org.settings?.siteTitle ?? org.name}
      logoSrc={logoSrc}
    />
  );
}
