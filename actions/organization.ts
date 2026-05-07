"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import type { ActionResult } from "./auth";

async function requireSuperAdmin() {
  const session = await requireSession();
  if (!session.isSuperAdmin) throw new Error("Super admin access required");
  return session;
}

export async function suspendOrgAction(orgId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.organization.update({ where: { id: orgId }, data: { status: "SUSPENDED" } });
  revalidatePath("/super-admin");
  return { success: true };
}

export async function activateOrgAction(orgId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.organization.update({ where: { id: orgId }, data: { status: "ACTIVE" } });
  revalidatePath("/super-admin");
  return { success: true };
}

export async function deleteOrgAction(orgId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.organization.delete({ where: { id: orgId } });
  revalidatePath("/super-admin");
  return { success: true };
}
