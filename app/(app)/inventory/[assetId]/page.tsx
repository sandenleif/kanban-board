export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AssetDetail } from "@/components/inventory/AssetDetail";

export default async function AssetDetailPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) notFound();

  const [asset, categories, locations, orgUsers] = await Promise.all([
    prisma.asset.findFirst({
      where: { id: assetId, organizationId: user.organizationId },
      include: {
        category:   { select: { id: true, name: true } },
        location:   { select: { id: true, name: true, building: true } },
        assignedTo: { select: { id: true, name: true } },
        assignments: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { assignedAt: "desc" },
          take: 20,
        },
      },
    }),
    prisma.assetCategory.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: "asc" } }),
    prisma.assetLocation.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!asset) notFound();

  return (
    <AssetDetail
      asset={asset}
      categories={categories}
      locations={locations}
      orgUsers={orgUsers}
      isAdmin={user.isAdmin}
    />
  );
}
