"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireProjectAccess, canEdit, canAdmin } from "@/lib/permissions";
import { z } from "zod";
import type { ActionResult } from "./auth";

const DEFAULT_COLUMNS = [
  { name: "Backlog", position: 0, color: "#64748b" },
  { name: "To Do", position: 1, color: "#3b82f6" },
  { name: "In Progress", position: 2, color: "#f59e0b" },
  { name: "Review", position: 3, color: "#8b5cf6" },
  { name: "Done", position: 4, color: "#22c55e" },
];

const createSectionSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  projectId: z.string().min(1),
});

export async function createSectionAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult & { sectionId?: string }> {
  const session = await requireSession();

  const raw = {
    name: formData.get("name") as string,
    projectId: formData.get("projectId") as string,
  };

  const parsed = createSectionSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { member } = await requireProjectAccess(parsed.data.projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const maxPos = await prisma.projectSection.aggregate({
    where: { projectId: parsed.data.projectId },
    _max: { position: true },
  });

  const section = await prisma.projectSection.create({
    data: {
      name: parsed.data.name,
      projectId: parsed.data.projectId,
      position: (maxPos._max.position ?? -1) + 1,
      columns: {
        create: DEFAULT_COLUMNS,
      },
    },
  });

  revalidatePath("/workspaces");
  return { success: true, sectionId: section.id };
}

export async function updateSectionAction(
  sectionId: string,
  name: string
): Promise<ActionResult> {
  const session = await requireSession();
  if (!name?.trim()) return { error: "Name is required" };

  const section = await prisma.projectSection.findUnique({ where: { id: sectionId } });
  if (!section) return { error: "Section not found" };

  const { member } = await requireProjectAccess(section.projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.projectSection.update({
    where: { id: sectionId },
    data: { name: name.trim() },
  });

  revalidatePath("/workspaces");
  return { success: true };
}

export async function deleteSectionAction(sectionId: string): Promise<ActionResult> {
  const session = await requireSession();

  const section = await prisma.projectSection.findUnique({
    where: { id: sectionId },
    include: { _count: { select: { columns: true } } },
  });
  if (!section) return { error: "Section not found" };

  const { member } = await requireProjectAccess(section.projectId, session.userId);
  if (!canAdmin(member.role)) return { error: "Insufficient permissions" };

  const taskCount = await prisma.task.count({
    where: { column: { sectionId } },
  });
  if (taskCount > 0) {
    return { error: `Cannot delete section with ${taskCount} task(s). Move or delete tasks first.` };
  }

  // prevent deleting the last section
  const sectionCount = await prisma.projectSection.count({
    where: { projectId: section.projectId },
  });
  if (sectionCount <= 1) {
    return { error: "Cannot delete the last section of a project." };
  }

  await prisma.projectSection.delete({ where: { id: sectionId } });

  revalidatePath("/workspaces");
  return { success: true };
}

export async function reorderSectionsAction(
  projectId: string,
  sectionIds: string[]
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.$transaction(
    sectionIds.map((id, position) =>
      prisma.projectSection.update({ where: { id }, data: { position } })
    )
  );

  revalidatePath("/workspaces");
  return { success: true };
}
