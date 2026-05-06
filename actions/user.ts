"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, createSession } from "@/lib/auth";
import type { ActionResult } from "./auth";

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  if (!name || name.length < 2) return { error: "Name must be at least 2 characters" };
  if (!email || !email.includes("@")) return { error: "Invalid email" };

  const existing = await prisma.user.findFirst({
    where: { email, NOT: { id: session.userId } },
  });
  if (existing) return { error: "Email already in use" };

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: { name, email },
  });

  await createSession({ userId: user.id, email: user.email, name: user.name });
  revalidatePath("/settings");
  return { success: true };
}

export async function updatePasswordAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;

  if (!currentPassword || !newPassword) return { error: "All fields required" };
  if (newPassword.length < 8) return { error: "New password must be at least 8 characters" };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "User not found" };

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return { error: "Current password is incorrect" };

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: session.userId }, data: { password: hashed } });

  return { success: true };
}
