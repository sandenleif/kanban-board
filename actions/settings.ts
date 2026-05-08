"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import type { ActionResult } from "./auth";

async function requireAdmin() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true, organizationId: true },
  });
  if (!user?.isAdmin) throw new Error("Admin access required");
  if (!user.organizationId) throw new Error("No organization");
  return { session, organizationId: user.organizationId };
}

export async function uploadLogoAction(formData: FormData): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) return { error: "No file selected" };
  if (!file.type.startsWith("image/")) return { error: "File must be an image" };
  if (file.size > 2 * 1024 * 1024) return { error: "Max file size is 2 MB" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  await prisma.appSettings.upsert({
    where: { organizationId },
    create: { organizationId, logoBase64: base64, logoMimeType: file.type },
    update: { logoBase64: base64, logoMimeType: file.type },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function removeLogoAction(): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();

  await prisma.appSettings.upsert({
    where: { organizationId },
    create: { organizationId, logoBase64: null, logoMimeType: null },
    update: { logoBase64: null, logoMimeType: null },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateLocaleAction(locale: string): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  if (!["en", "de", "fr", "es"].includes(locale)) return { error: "Invalid locale" };

  await prisma.appSettings.upsert({
    where: { organizationId },
    create: { organizationId, locale },
    update: { locale },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateSmtpSettingsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();

  const host = (formData.get("smtpHost") as string)?.trim() || null;
  const port = formData.get("smtpPort") ? parseInt(formData.get("smtpPort") as string) : null;
  const user = (formData.get("smtpUser") as string)?.trim() || null;
  const password = (formData.get("smtpPassword") as string) || null;
  const from = (formData.get("smtpFrom") as string)?.trim() || null;
  const secure = formData.get("smtpSecure") === "true";

  await prisma.appSettings.upsert({
    where: { organizationId },
    create: { organizationId, smtpHost: host, smtpPort: port, smtpUser: user, smtpPassword: password, smtpFrom: from, smtpSecure: secure },
    update: { smtpHost: host, smtpPort: port, smtpUser: user, smtpPassword: password, smtpFrom: from, smtpSecure: secure },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function getLogoAction() {
  const session = await requireSession();
  if (!session.organizationId) return null;
  return prisma.appSettings.findUnique({
    where: { organizationId: session.organizationId },
    select: { logoBase64: true, logoMimeType: true },
  });
}
