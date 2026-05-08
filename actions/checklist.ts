"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireWorkspaceMember, canEdit } from "@/lib/permissions";
import type { ActionResult } from "./auth";
import type { ChecklistItemPriority } from "@prisma/client";

// ── Workspace checklist categories ────────────────────────────────────────

export async function createWorkspaceChecklistCategoryAction(
  workspaceId: string,
  name: string
): Promise<ActionResult & { id?: string }> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  const max = await prisma.workspaceChecklistCategory.aggregate({
    where: { workspaceId },
    _max: { position: true },
  });
  const category = await prisma.workspaceChecklistCategory.create({
    data: { workspaceId, name: name.trim(), position: (max._max.position ?? -1) + 1 },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true, id: category.id };
}

export async function updateWorkspaceChecklistCategoryAction(
  workspaceId: string,
  categoryId: string,
  name: string
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.workspaceChecklistCategory.updateMany({
    where: { id: categoryId, workspaceId },
    data: { name: name.trim() },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true };
}

export async function deleteWorkspaceChecklistCategoryAction(
  workspaceId: string,
  categoryId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.workspaceChecklistCategory.deleteMany({
    where: { id: categoryId, workspaceId },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true };
}

// ── Workspace checklist items ──────────────────────────────────────────────

export async function createWorkspaceChecklistItemAction(
  workspaceId: string,
  categoryId: string,
  title: string,
  priority: ChecklistItemPriority = "MEDIUM"
): Promise<ActionResult & { id?: string }> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  const max = await prisma.workspaceChecklistItem.aggregate({
    where: { categoryId },
    _max: { position: true },
  });
  const item = await prisma.workspaceChecklistItem.create({
    data: { categoryId, title: title.trim(), priority, position: (max._max.position ?? -1) + 1 },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true, id: item.id };
}

export async function updateWorkspaceChecklistItemAction(
  workspaceId: string,
  itemId: string,
  data: { title?: string; priority?: ChecklistItemPriority }
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.workspaceChecklistItem.update({
    where: { id: itemId },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.priority !== undefined && { priority: data.priority }),
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true };
}

export async function deleteWorkspaceChecklistItemAction(
  workspaceId: string,
  itemId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.workspaceChecklistItem.delete({ where: { id: itemId } });
  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true };
}

// ── Workspace checklist sub-items ──────────────────────────────────────────

export async function createWorkspaceChecklistSubItemAction(
  workspaceId: string,
  itemId: string,
  title: string,
  description?: string
): Promise<ActionResult & { id?: string }> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  const max = await prisma.workspaceChecklistSubItem.aggregate({
    where: { itemId },
    _max: { position: true },
  });
  const sub = await prisma.workspaceChecklistSubItem.create({
    data: {
      itemId,
      title: title.trim(),
      description: description?.trim() || null,
      position: (max._max.position ?? -1) + 1,
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true, id: sub.id };
}

export async function updateWorkspaceChecklistSubItemAction(
  workspaceId: string,
  subItemId: string,
  data: { title?: string; description?: string; completed?: boolean }
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.workspaceChecklistSubItem.update({
    where: { id: subItemId },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() || null }),
      ...(data.completed !== undefined && { completed: data.completed }),
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true };
}

export async function deleteWorkspaceChecklistSubItemAction(
  workspaceId: string,
  subItemId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.workspaceChecklistSubItem.delete({ where: { id: subItemId } });
  revalidatePath(`/workspaces/${workspaceId}`);
  return { success: true };
}

// ── Move sub-item to a project column as a task ────────────────────────────

export async function moveSubItemToProjectAction(
  workspaceId: string,
  subItemId: string,
  targetProjectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member || !canEdit(member.role)) return { error: "Insufficient permissions" };

  const subItem = await prisma.workspaceChecklistSubItem.findUnique({
    where: { id: subItemId },
    include: { item: true },
  });
  if (!subItem) return { error: "Sub-item not found" };

  // Find a "Geplant" / "Planned" / "To Do" / first column in the project
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

  if (!column) return { error: "No column found in target project" };

  const maxPos = await prisma.task.aggregate({
    where: { columnId: column.id },
    _max: { position: true },
  });

  const title = subItem.title;
  const description = [
    subItem.description,
    `Priorität: ${subItem.item.priority}`,
  ].filter(Boolean).join("\n\n");

  await prisma.task.create({
    data: {
      title,
      description: description || null,
      columnId: column.id,
      projectId: targetProjectId,
      createdById: session.userId,
      position: (maxPos._max.position ?? -1) + 1,
      priority: (subItem.item.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT"),
      assignees: { create: { userId: session.userId } },
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces`, "layout");
  return { success: true };
}

// ── Personal checklist ────────────────────────────────────────────────────

async function getOrCreatePersonalSpace(userId: string) {
  return prisma.personalSpace.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function createPersonalChecklistCategoryAction(
  name: string
): Promise<ActionResult & { id?: string }> {
  const session = await requireSession();
  const space = await getOrCreatePersonalSpace(session.userId);

  const max = await prisma.personalChecklistCategory.aggregate({
    where: { personalSpaceId: space.id },
    _max: { position: true },
  });
  const cat = await prisma.personalChecklistCategory.create({
    data: { personalSpaceId: space.id, name: name.trim(), position: (max._max.position ?? -1) + 1 },
  });

  revalidatePath("/personal");
  return { success: true, id: cat.id };
}

export async function updatePersonalChecklistCategoryAction(
  categoryId: string,
  name: string
): Promise<ActionResult> {
  const session = await requireSession();
  const space = await getOrCreatePersonalSpace(session.userId);

  await prisma.personalChecklistCategory.updateMany({
    where: { id: categoryId, personalSpaceId: space.id },
    data: { name: name.trim() },
  });

  revalidatePath("/personal");
  return { success: true };
}

export async function deletePersonalChecklistCategoryAction(
  categoryId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const space = await getOrCreatePersonalSpace(session.userId);

  await prisma.personalChecklistCategory.deleteMany({
    where: { id: categoryId, personalSpaceId: space.id },
  });

  revalidatePath("/personal");
  return { success: true };
}

export async function createPersonalChecklistItemAction(
  categoryId: string,
  title: string,
  priority: ChecklistItemPriority = "MEDIUM"
): Promise<ActionResult & { id?: string }> {
  const session = await requireSession();
  await getOrCreatePersonalSpace(session.userId);

  const max = await prisma.personalChecklistItem.aggregate({
    where: { categoryId },
    _max: { position: true },
  });
  const item = await prisma.personalChecklistItem.create({
    data: { categoryId, title: title.trim(), priority, position: (max._max.position ?? -1) + 1 },
  });

  revalidatePath("/personal");
  return { success: true, id: item.id };
}

export async function updatePersonalChecklistItemAction(
  itemId: string,
  data: { title?: string; priority?: ChecklistItemPriority }
): Promise<ActionResult> {
  await requireSession();
  await prisma.personalChecklistItem.update({
    where: { id: itemId },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.priority !== undefined && { priority: data.priority }),
    },
  });

  revalidatePath("/personal");
  return { success: true };
}

export async function deletePersonalChecklistItemAction(itemId: string): Promise<ActionResult> {
  await requireSession();
  await prisma.personalChecklistItem.delete({ where: { id: itemId } });
  revalidatePath("/personal");
  return { success: true };
}

export async function createPersonalChecklistSubItemAction(
  itemId: string,
  title: string,
  description?: string
): Promise<ActionResult & { id?: string }> {
  await requireSession();

  const max = await prisma.personalChecklistSubItem.aggregate({
    where: { itemId },
    _max: { position: true },
  });
  const sub = await prisma.personalChecklistSubItem.create({
    data: {
      itemId,
      title: title.trim(),
      description: description?.trim() || null,
      position: (max._max.position ?? -1) + 1,
    },
  });

  revalidatePath("/personal");
  return { success: true, id: sub.id };
}

export async function updatePersonalChecklistSubItemAction(
  subItemId: string,
  data: { title?: string; description?: string; completed?: boolean }
): Promise<ActionResult> {
  await requireSession();
  await prisma.personalChecklistSubItem.update({
    where: { id: subItemId },
    data: {
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() || null }),
      ...(data.completed !== undefined && { completed: data.completed }),
    },
  });

  revalidatePath("/personal");
  return { success: true };
}

export async function deletePersonalChecklistSubItemAction(subItemId: string): Promise<ActionResult> {
  await requireSession();
  await prisma.personalChecklistSubItem.delete({ where: { id: subItemId } });
  revalidatePath("/personal");
  return { success: true };
}
