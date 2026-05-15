import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { AssetForm } from "@/components/inventory/AssetForm";

export default async function NewAssetPage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) notFound();

  const [categories, locations, orgUsers] = await Promise.all([
    prisma.assetCategory.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: "asc" } }),
    prisma.assetLocation.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl mx-auto animate-in">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Neues Asset</h1>
      <AssetForm categories={categories} locations={locations} orgUsers={orgUsers} />
    </div>
  );
}
