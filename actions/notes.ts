"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireWorkspaceMember, canEdit } from "@/lib/permissions";
import type { ActionResult } from "./auth";

// ── Workspace note ─────────────────────────────────────────────────────────

export async function upsertWorkspaceNoteAction(
  workspaceId: string,
  content: string
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.workspaceNote.upsert({
    where: { workspaceId },
    create: { workspaceId, content },
    update: { content },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true };
}

export async function getWorkspaceNoteAction(workspaceId: string) {
  const session = await requireSession();
  await requireWorkspaceMember(workspaceId, session.userId);

  return prisma.workspaceNote.findUnique({
    where: { workspaceId },
    select: { content: true },
  });
}

// ── Personal space notes ───────────────────────────────────────────────────

export async function upsertPersonalNotesAction(content: string): Promise<ActionResult> {
  const session = await requireSession();

  await prisma.personalSpace.upsert({
    where: { userId: session.userId },
    create: { userId: session.userId, notes: content },
    update: { notes: content },
  });

  revalidatePath("/personal");
  return { success: true };
}

export async function getPersonalSpaceAction() {
  const session = await requireSession();

  return prisma.personalSpace.findUnique({
    where: { userId: session.userId },
    select: {
      notes: true,
      personalChecklistCategories: {
        orderBy: { position: "asc" },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: {
              subItems: { orderBy: { position: "asc" } },
            },
          },
        },
      },
    },
  });
}
