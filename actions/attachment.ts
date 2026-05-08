"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireProjectAccess, canEdit } from "@/lib/permissions";
import type { ActionResult } from "./auth";

export async function uploadAttachmentAction(
  taskId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult & { id?: string; name?: string; size?: number; mimeType?: string; createdAt?: string }> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Keine Datei ausgewählt" };
  if (file.size > 5 * 1024 * 1024) return { error: "Maximale Dateigröße: 5 MB" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileData = buffer.toString("base64");
  const url = `/api/attachments/`; // placeholder, updated after create

  const att = await prisma.attachment.create({
    data: {
      name: file.name,
      url: "", // filled below
      fileData,
      size: file.size,
      mimeType: file.type,
      taskId,
      uploadedById: session.userId,
    },
  });

  await prisma.attachment.update({
    where: { id: att.id },
    data: { url: `/api/attachments/${att.id}` },
  });

  revalidatePath("/workspaces", "layout");
  return {
    success: true,
    id: att.id,
    name: att.name,
    size: att.size,
    mimeType: att.mimeType,
    createdAt: att.createdAt.toISOString(),
  };
}

export async function deleteAttachmentAction(
  attachmentId: string,
  projectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.attachment.delete({ where: { id: attachmentId } });
  revalidatePath("/workspaces", "layout");
  return { success: true };
}
