"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireWorkspaceMember, canEdit } from "@/lib/permissions";
import type { ActionResult } from "./auth";
import type { NotePriority } from "@prisma/client";

const MAX_NOTES = 20;

// ── Workspace notes ────────────────────────────────────────────────────────

export async function createWorkspaceNoteAction(
  workspaceId: string,
  title: string,
  priority: NotePriority = "MEDIUM"
): Promise<ActionResult & { id?: string }> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  const count = await prisma.workspaceNote.count({ where: { workspaceId } });
  if (count >= MAX_NOTES) return { error: `Maximal ${MAX_NOTES} Notizen erlaubt` };

  const max = await prisma.workspaceNote.aggregate({ where: { workspaceId }, _max: { position: true } });
  const note = await prisma.workspaceNote.create({
    data: { workspaceId, title: title.trim(), priority, position: (max._max.position ?? -1) + 1 },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true, id: note.id };
}

export async function updateWorkspaceNoteAction(
  workspaceId: string,
  noteId: string,
  data: { title?: string; content?: string; priority?: NotePriority }
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.workspaceNote.updateMany({
    where: { id: noteId, workspaceId },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.content !== undefined && { content: data.content || null }),
      ...(data.priority !== undefined && { priority: data.priority }),
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true };
}

export async function deleteWorkspaceNoteAction(
  workspaceId: string,
  noteId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.workspaceNote.deleteMany({ where: { id: noteId, workspaceId } });
  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true };
}

export async function convertWorkspaceNoteToTaskAction(
  workspaceId: string,
  noteId: string,
  targetProjectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  const note = await prisma.workspaceNote.findFirst({ where: { id: noteId, workspaceId } });
  if (!note) return { error: "Notiz nicht gefunden" };

  const column = await prisma.boardColumn.findFirst({
    where: {
      section: { projectId: targetProjectId },
      OR: [
        { name: { equals: "Geplant", mode: "insensitive" } },
        { name: { equals: "Planned", mode: "insensitive" } },
        { name: { equals: "To Do", mode: "insensitive" } },
        { name: { equals: "Todo", mode: "insensitive" } },
      ],
    },
    orderBy: { position: "asc" },
  }) ?? await prisma.boardColumn.findFirst({
    where: { section: { projectId: targetProjectId } },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
  });

  if (!column) return { error: "Kein Spalte im Zielprojekt gefunden" };

  const maxPos = await prisma.task.aggregate({ where: { columnId: column.id }, _max: { position: true } });

  await prisma.task.create({
    data: {
      title: note.title,
      description: note.content || null,
      priority: note.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      columnId: column.id,
      projectId: targetProjectId,
      createdById: session.userId,
      position: (maxPos._max.position ?? -1) + 1,
      assignees: { create: { userId: session.userId } },
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath("/workspaces", "layout");
  return { success: true };
}

// ── Personal notes ─────────────────────────────────────────────────────────

async function getOrCreatePersonalSpace(userId: string) {
  return prisma.personalSpace.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function createPersonalNoteAction(
  title: string,
  priority: NotePriority = "MEDIUM"
): Promise<ActionResult & { id?: string }> {
  const session = await requireSession();
  const space = await getOrCreatePersonalSpace(session.userId);

  const count = await prisma.personalNote.count({ where: { personalSpaceId: space.id } });
  if (count >= MAX_NOTES) return { error: `Maximal ${MAX_NOTES} Notizen erlaubt` };

  const max = await prisma.personalNote.aggregate({ where: { personalSpaceId: space.id }, _max: { position: true } });
  const note = await prisma.personalNote.create({
    data: { personalSpaceId: space.id, title: title.trim(), priority, position: (max._max.position ?? -1) + 1 },
  });

  revalidatePath("/personal");
  return { success: true, id: note.id };
}

export async function updatePersonalNoteAction(
  noteId: string,
  data: { title?: string; content?: string; priority?: NotePriority }
): Promise<ActionResult> {
  const session = await requireSession();
  const space = await getOrCreatePersonalSpace(session.userId);

  await prisma.personalNote.updateMany({
    where: { id: noteId, personalSpaceId: space.id },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.content !== undefined && { content: data.content || null }),
      ...(data.priority !== undefined && { priority: data.priority }),
    },
  });

  revalidatePath("/personal");
  return { success: true };
}

export async function deletePersonalNoteAction(noteId: string): Promise<ActionResult> {
  const session = await requireSession();
  const space = await getOrCreatePersonalSpace(session.userId);

  await prisma.personalNote.deleteMany({ where: { id: noteId, personalSpaceId: space.id } });
  revalidatePath("/personal");
  return { success: true };
}

export async function convertPersonalNoteToTaskAction(
  noteId: string,
  targetProjectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const space = await getOrCreatePersonalSpace(session.userId);

  const note = await prisma.personalNote.findFirst({ where: { id: noteId, personalSpaceId: space.id } });
  if (!note) return { error: "Notiz nicht gefunden" };

  const column = await prisma.boardColumn.findFirst({
    where: {
      section: { projectId: targetProjectId },
      OR: [
        { name: { equals: "Geplant", mode: "insensitive" } },
        { name: { equals: "Planned", mode: "insensitive" } },
        { name: { equals: "To Do", mode: "insensitive" } },
        { name: { equals: "Todo", mode: "insensitive" } },
      ],
    },
    orderBy: { position: "asc" },
  }) ?? await prisma.boardColumn.findFirst({
    where: { section: { projectId: targetProjectId } },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
  });

  if (!column) return { error: "Keine Spalte im Zielprojekt gefunden" };

  const maxPos = await prisma.task.aggregate({ where: { columnId: column.id }, _max: { position: true } });
  await prisma.task.create({
    data: {
      title: note.title,
      description: note.content || null,
      priority: note.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      columnId: column.id,
      projectId: targetProjectId,
      createdById: session.userId,
      position: (maxPos._max.position ?? -1) + 1,
      assignees: { create: { userId: session.userId } },
    },
  });

  revalidatePath("/personal");
  revalidatePath("/workspaces", "layout");
  return { success: true };
}
