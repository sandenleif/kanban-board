export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AssetList } from "@/components/inventory/AssetList";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string; q?: string; location?: string }>;
}) {
  const session = await requireSession();
  const { category, status, q, location } = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) notFound();
  const orgId = user.organizationId;

  const [assets, categories, locations, orgUsers] = await Promise.all([
    prisma.asset.findMany({
      where: {
        organizationId: orgId,
        ...(category ? { categoryId: category } : {}),
        ...(location ? { locationId: location } : {}),
        ...(status ? { status: status as never } : {}),
        ...(q ? {
          OR: [
            { name:            { contains: q, mode: "insensitive" as const } },
            { inventoryNumber: { contains: q, mode: "insensitive" as const } },
            { serialNumber:    { contains: q, mode: "insensitive" as const } },
            { manufacturer:    { contains: q, mode: "insensitive" as const } },
            { model:           { contains: q, mode: "insensitive" as const } },
          ],
        } : {}),
      },
      include: {
        category:   { select: { name: true } },
        location:   { select: { name: true, building: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.assetCategory.findMany({ where: { organizationId: orgId }, orderBy: { position: "asc" } }),
    prisma.assetLocation.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { organizationId: orgId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AssetList
      assets={assets}
      categories={categories}
      locations={locations}
      orgUsers={orgUsers}
      isAdmin={user.isAdmin}
      currentFilters={{ category, status, q, location }}
    />
  );
}
