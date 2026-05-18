export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PackageDetail } from "@/components/software/PackageDetail";

export default async function PackageDetailPage({ params }: { params: Promise<{ packageId: string }> }) {
  const { packageId } = await params;
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) notFound();
  const orgId = user.organizationId;

  const [pkg, agents, groups, jobs] = await Promise.all([
    prisma.softwarePackage.findFirst({
      where: { id: packageId, organizationId: orgId },
    }),
    prisma.softwareAgent.findMany({
      where: { organizationId: orgId },
      include: { asset: { select: { name: true } } },
      orderBy: { hostname: "asc" },
    }),
    prisma.agentGroup.findMany({
      where: { organizationId: orgId },
      include: {
        _count: { select: { members: true } },
        members: { select: { agentId: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.softwareJob.findMany({
      where: { packageId },
      include: { agent: { select: { id: true, hostname: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  if (!pkg) notFound();

  return <PackageDetail pkg={pkg} agents={agents} groups={groups} jobs={jobs} isAdmin={user.isAdmin} />;
}
