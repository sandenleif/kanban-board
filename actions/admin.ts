"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import type { ActionResult } from "./auth";

async function requireAdmin() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) throw new Error("Admin access required");
  return session;
}

export async function approveUserAction(userId: string): Promise<ActionResult> {
  await requireAdmin();

  await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function suspendUserAction(userId: string): Promise<ActionResult> {
  await requireAdmin();

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (target?.isAdmin) return { error: "Cannot suspend another admin." };

  await prisma.user.update({
    where: { id: userId },
    data: { status: "SUSPENDED" },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function reactivateUserAction(userId: string): Promise<ActionResult> {
  await requireAdmin();

  await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (userId === session.userId) return { error: "Cannot delete your own account." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (target?.isAdmin) return { error: "Cannot delete another admin." };

  await prisma.user.delete({ where: { id: userId } });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function promoteToAdminAction(userId: string): Promise<ActionResult> {
  await requireAdmin();

  await prisma.user.update({
    where: { id: userId },
    data: { isAdmin: true },
  });

  revalidatePath("/admin/users");
  return { success: true };
}
