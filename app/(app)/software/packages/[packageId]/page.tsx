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

  const [pkg, agents, jobs] = await Promise.all([
    prisma.softwarePackage.findFirst({
      where: { id: packageId, organizationId: user.organizationId },
    }),
    prisma.softwareAgent.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { hostname: "asc" },
    }),
    prisma.softwareJob.findMany({
      where: { packageId },
      include: { agent: { select: { id: true, hostname: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  if (!pkg) notFound();

  return <PackageDetail pkg={pkg} agents={agents} jobs={jobs} isAdmin={user.isAdmin} />;
}
