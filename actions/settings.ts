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

export async function uploadLogoAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return { error: "No file selected" };
  if (!file.type.startsWith("image/")) return { error: "File must be an image" };
  if (file.size > 2 * 1024 * 1024) return { error: "Max file size is 2 MB" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", logoBase64: base64, logoMimeType: file.type },
    update: { logoBase64: base64, logoMimeType: file.type },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function removeLogoAction(): Promise<ActionResult> {
  await requireAdmin();

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", logoBase64: null, logoMimeType: null },
    update: { logoBase64: null, logoMimeType: null },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateLocaleAction(locale: string): Promise<ActionResult> {
  await requireAdmin();
  if (!["en", "de", "fr", "es"].includes(locale)) return { error: "Invalid locale" };

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", locale },
    update: { locale },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function getLogoAction() {
  const settings = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
    select: { logoBase64: true, logoMimeType: true },
  });
  return settings;
}
