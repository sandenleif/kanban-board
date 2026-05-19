"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireSession, createSession } from "@/lib/auth";
import type { ActionResult } from "./auth";

export async function updateThemeAction(theme: "dark" | "light"): Promise<ActionResult> {
  const session = await requireSession();

  await prisma.user.update({ where: { id: session.userId }, data: { theme } });

  const cookieStore = await cookies();
  cookieStore.set("kb_theme", theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: "lax",
  });

  return { success: true };
}

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

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: session.organizationId,
    isSuperAdmin: session.isSuperAdmin,
  });
  revalidatePath("/settings");
  return { success: true };
}

export async function uploadAvatarAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) return { error: "No file selected" };
  if (!file.type.startsWith("image/")) return { error: "File must be an image" };
  if (file.size > 2 * 1024 * 1024) return { error: "Max file size is 2 MB" };

  const { writeFile: wf, mkdir: md } = await import("fs/promises");
  const { join } = await import("path");
  const UPLOAD_DIR = join(process.cwd(), "uploads");
  const ext  = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const path = `avatars/${session.userId}.${ext}`;
  await md(join(UPLOAD_DIR, "avatars"), { recursive: true });
  await wf(join(UPLOAD_DIR, path), Buffer.from(await file.arrayBuffer()));

  await prisma.user.update({
    where: { id: session.userId },
    data: { avatarPath: path, avatarMimeType: file.type, avatarBase64: null },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function removeAvatarAction(): Promise<ActionResult> {
  const session = await requireSession();
  const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { avatarPath: true } });
  if (u?.avatarPath) {
    const { unlink } = await import("fs/promises");
    const { join } = await import("path");
    await unlink(join(process.cwd(), "uploads", u.avatarPath)).catch(() => {});
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { avatarPath: null, avatarBase64: null, avatarMimeType: null },
  });

  revalidatePath("/", "layout");
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

  if (!user.password) return { error: "Account uses AD login — no local password set" };
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return { error: "Current password is incorrect" };

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: session.userId }, data: { password: hashed } });

  return { success: true };
}
