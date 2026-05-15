"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import type { ActionResult } from "./auth";

async function requireOrgMember() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) throw new Error("No organization");
  return { session, organizationId: user.organizationId, isAdmin: user.isAdmin };
}

// ── Categories ────────────────────────────────────────────────────────────

export async function upsertAssetCategoryAction(data: {
  id?: string; name: string; icon?: string;
}): Promise<ActionResult> {
  const { organizationId, isAdmin } = await requireOrgMember();
  if (!isAdmin) return { error: "Admin erforderlich" };
  if (!data.name?.trim()) return { error: "Name erforderlich" };

  if (data.id) {
    await prisma.assetCategory.updateMany({
      where: { id: data.id, organizationId },
      data: { name: data.name.trim(), icon: data.icon ?? null },
    });
  } else {
    const max = await prisma.assetCategory.findFirst({
      where: { organizationId }, orderBy: { position: "desc" }, select: { position: true },
    });
    await prisma.assetCategory.create({
      data: { organizationId, name: data.name.trim(), icon: data.icon ?? null, position: (max?.position ?? 0) + 1 },
    });
  }
  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteAssetCategoryAction(id: string): Promise<ActionResult> {
  const { organizationId, isAdmin } = await requireOrgMember();
  if (!isAdmin) return { error: "Admin erforderlich" };
  await prisma.assetCategory.deleteMany({ where: { id, organizationId } });
  revalidatePath("/inventory");
  return { success: true };
}

// ── Locations ─────────────────────────────────────────────────────────────

export async function upsertAssetLocationAction(data: {
  id?: string; name: string; building?: string;
}): Promise<ActionResult> {
  const { organizationId, isAdmin } = await requireOrgMember();
  if (!isAdmin) return { error: "Admin erforderlich" };
  if (!data.name?.trim()) return { error: "Name erforderlich" };

  if (data.id) {
    await prisma.assetLocation.updateMany({
      where: { id: data.id, organizationId },
      data: { name: data.name.trim(), building: data.building?.trim() || null },
    });
  } else {
    await prisma.assetLocation.create({
      data: { organizationId, name: data.name.trim(), building: data.building?.trim() || null },
    });
  }
  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteAssetLocationAction(id: string): Promise<ActionResult> {
  const { organizationId, isAdmin } = await requireOrgMember();
  if (!isAdmin) return { error: "Admin erforderlich" };
  await prisma.assetLocation.deleteMany({ where: { id, organizationId } });
  revalidatePath("/inventory");
  return { success: true };
}

// ── Assets ────────────────────────────────────────────────────────────────

export async function createAssetAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const { organizationId } = await requireOrgMember();

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name erforderlich" };

  const asset = await prisma.asset.create({
    data: {
      organizationId,
      name,
      inventoryNumber: (formData.get("inventoryNumber") as string)?.trim() || null,
      serialNumber:    (formData.get("serialNumber") as string)?.trim() || null,
      manufacturer:    (formData.get("manufacturer") as string)?.trim() || null,
      model:           (formData.get("model") as string)?.trim() || null,
      categoryId:      (formData.get("categoryId") as string) || null,
      locationId:      (formData.get("locationId") as string) || null,
      assignedToId:    (formData.get("assignedToId") as string) || null,
      status:          (formData.get("status") as never) || "ACTIVE",
      purchaseDate:    (formData.get("purchaseDate") as string) ? new Date(formData.get("purchaseDate") as string) : null,
      warrantyUntil:   (formData.get("warrantyUntil") as string) ? new Date(formData.get("warrantyUntil") as string) : null,
      purchasePrice:   (formData.get("purchasePrice") as string) ? parseFloat(formData.get("purchasePrice") as string) : null,
      notes:           (formData.get("notes") as string)?.trim() || null,
    },
  });

  revalidatePath("/inventory");
  return { success: true, id: asset.id };
}

export async function updateAssetAction(
  assetId: string,
  data: {
    name?: string; inventoryNumber?: string | null; serialNumber?: string | null;
    manufacturer?: string | null; model?: string | null;
    categoryId?: string | null; locationId?: string | null; assignedToId?: string | null;
    status?: string; purchaseDate?: Date | null; warrantyUntil?: Date | null;
    purchasePrice?: number | null; notes?: string | null;
  }
): Promise<ActionResult> {
  const { organizationId } = await requireOrgMember();
  await prisma.asset.updateMany({ where: { id: assetId, organizationId }, data: data as never });
  revalidatePath(`/inventory/${assetId}`);
  revalidatePath("/inventory");
  return { success: true };
}

export async function deleteAssetAction(assetId: string): Promise<ActionResult> {
  const { organizationId, isAdmin } = await requireOrgMember();
  if (!isAdmin) return { error: "Admin erforderlich" };
  await prisma.asset.deleteMany({ where: { id: assetId, organizationId } });
  revalidatePath("/inventory");
  return { success: true };
}

export async function assignAssetAction(
  assetId: string, userId: string | null
): Promise<ActionResult> {
  const { organizationId } = await requireOrgMember();

  const asset = await prisma.asset.findFirst({ where: { id: assetId, organizationId } });
  if (!asset) return { error: "Asset nicht gefunden" };

  await prisma.$transaction(async (tx) => {
    // Close previous assignment if open
    if (asset.assignedToId) {
      await tx.assetAssignment.updateMany({
        where: { assetId, returnedAt: null },
        data: { returnedAt: new Date() },
      });
    }
    // Create new assignment
    if (userId) {
      await tx.assetAssignment.create({ data: { assetId, userId } });
    }
    await tx.asset.update({ where: { id: assetId }, data: { assignedToId: userId } });
  });

  revalidatePath(`/inventory/${assetId}`);
  return { success: true };
}
