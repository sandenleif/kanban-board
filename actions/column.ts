"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireProjectAccess, canEdit, canAdmin } from "@/lib/permissions";
import { z } from "zod";
import type { ActionResult } from "./auth";

const createColumnSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  sectionId: z.string().min(1),
});

async function getProjectIdFromSection(sectionId: string): Promise<string | null> {
  const section = await prisma.projectSection.findUnique({
    where: { id: sectionId },
    select: { projectId: true },
  });
  return section?.projectId ?? null;
}

export async function createColumnAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();

  const raw = {
    name: formData.get("name") as string,
    sectionId: formData.get("sectionId") as string,
  };

  const parsed = createColumnSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const projectId = await getProjectIdFromSection(parsed.data.sectionId);
  if (!projectId) return { error: "Section not found" };

  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const maxPos = await prisma.boardColumn.aggregate({
    where: { sectionId: parsed.data.sectionId },
    _max: { position: true },
  });

  await prisma.boardColumn.create({
    data: {
      name: parsed.data.name,
      sectionId: parsed.data.sectionId,
      position: (maxPos._max.position ?? -1) + 1,
    },
  });

  revalidatePath("/workspaces");
  return { success: true };
}

export async function updateColumnAction(
  columnId: string,
  projectId: string,
  name: string
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };
  if (!name?.trim()) return { error: "Name is required" };

  await prisma.boardColumn.update({ where: { id: columnId }, data: { name: name.trim() } });

  revalidatePath("/workspaces");
  return { success: true };
}

export async function deleteColumnAction(
  columnId: string,
  projectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canAdmin(member.role)) return { error: "Insufficient permissions" };

  const taskCount = await prisma.task.count({ where: { columnId } });
  if (taskCount > 0) {
    return { error: `Cannot delete column with ${taskCount} task(s). Move or delete tasks first.` };
  }

  await prisma.boardColumn.delete({ where: { id: columnId } });

  revalidatePath("/workspaces");
  return { success: true };
}

export async function reorderColumnsAction(
  sectionId: string,
  projectId: string,
  columnIds: string[]
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.$transaction(
    columnIds.map((id, position) =>
      prisma.boardColumn.update({ where: { id }, data: { position } })
    )
  );

  revalidatePath("/workspaces");
  return { success: true };
}
