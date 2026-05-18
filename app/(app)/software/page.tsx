export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { SoftwareDashboard } from "@/components/software/SoftwareDashboard";

export default async function SoftwarePage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) notFound();
  const orgId = user.organizationId;

  const [packages, agents, recentJobs, appSettings] = await Promise.all([
    prisma.softwarePackage.findMany({
      where: { organizationId: orgId, NOT: { type: "agent_update" } },
      include: { _count: { select: { jobs: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.softwareAgent.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { jobs: true } } },
      orderBy: { hostname: "asc" },
    }),
    prisma.softwareJob.findMany({
      where: { agent: { organizationId: orgId } },
      include: {
        package: { select: { id: true, name: true } },
        agent:   { select: { id: true, hostname: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.appSettings.findUnique({
      where: { organizationId: orgId },
      select: { enrollmentToken: true },
    }),
  ]);

  return (
    <SoftwareDashboard
      packages={packages}
      agents={agents}
      recentJobs={recentJobs}
      isAdmin={user.isAdmin}
      enrollmentToken={appSettings?.enrollmentToken ?? null}
    />
  );
}
