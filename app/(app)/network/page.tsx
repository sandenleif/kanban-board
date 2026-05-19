export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { NetworkDashboard } from "@/components/network/NetworkDashboard";

export default async function NetworkPage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.isAdmin || !user.organizationId) notFound();

  const [vlans, agents] = await Promise.all([
    prisma.networkVlan.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      include: {
        scans: {
          orderBy: { scannedAt: "desc" },
          take: 1,
          select: { id: true, scannedAt: true, activeCount: true, totalPinged: true, results: true },
        },
      },
    }),
    prisma.softwareAgent.findMany({
      where: { organizationId: user.organizationId },
      select: { hostname: true, ipAddress: true, osVersion: true, lastSeenAt: true, manufacturer: true, model: true, vlanId: true },
    }),
  ]);

  return <NetworkDashboard vlans={vlans} agents={agents} />;
}
