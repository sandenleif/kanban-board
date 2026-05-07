"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function getNotificationsAction() {
  const session = await requireSession();
  return prisma.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function markAllReadAction() {
  const session = await requireSession();
  await prisma.notification.updateMany({
    where: { userId: session.userId, read: false },
    data: { read: true },
  });
}

export async function markOneReadAction(id: string) {
  const session = await requireSession();
  await prisma.notification.update({
    where: { id, userId: session.userId },
    data: { read: true },
  });
}
