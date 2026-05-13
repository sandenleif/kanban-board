export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { requirePortalSession } from "@/lib/portal-auth";
import { PortalDashboard } from "@/components/portal/PortalDashboard";
import { notFound } from "next/navigation";

export default async function PortalPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSession(orgSlug);

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: {
      id: true, name: true, status: true,
      settings: { select: { logoBase64: true, logoMimeType: true, siteTitle: true } },
    },
  });
  if (!org || org.status !== "ACTIVE") notFound();

  const [tickets, categories] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        organizationId: org.id,
        fromEmail: session.email,
      },
      include: {
        queue: { select: { name: true } },
        category: { select: { name: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.ticketCategory.findMany({
      where: { organizationId: org.id },
      orderBy: { position: "asc" },
    }),
  ]);

  const logoSrc = org.settings?.logoBase64 && org.settings.logoMimeType
    ? `data:${org.settings.logoMimeType};base64,${org.settings.logoBase64}`
    : null;

  return (
    <PortalDashboard
      session={session}
      orgSlug={orgSlug}
      orgName={org.settings?.siteTitle ?? org.name}
      logoSrc={logoSrc}
      tickets={tickets}
      categories={categories}
    />
  );
}
