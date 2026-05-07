"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireProjectAccess, canEdit } from "@/lib/permissions";
import {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  createCommentSchema,
  createChecklistItemSchema,
} from "@/lib/validations/task";
import type { ActionResult } from "./auth";

export async function createTaskAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult & { taskId?: string }> {
  const session = await requireSession();

  const raw = {
    title: formData.get("title") as string,
    description: formData.get("description") as string || undefined,
    priority: (formData.get("priority") as string) || "MEDIUM",
    dueDate: formData.get("dueDate") as string || undefined,
    columnId: formData.get("columnId") as string,
    projectId: formData.get("projectId") as string,
    assigneeId: formData.get("assigneeId") as string || undefined,
  };

  const parsed = createTaskSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { member } = await requireProjectAccess(parsed.data.projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const maxPos = await prisma.task.aggregate({
    where: { columnId: parsed.data.columnId },
    _max: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      priority: parsed.data.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      columnId: parsed.data.columnId,
      projectId: parsed.data.projectId,
      createdById: session.userId,
      assigneeId: parsed.data.assigneeId || session.userId,
      position: (maxPos._max.position ?? -1) + 1,
    },
  });

  await prisma.taskActivity.create({
    data: {
      type: "CREATED",
      taskId: task.id,
      userId: session.userId,
      content: `created this task`,
    },
  });

  revalidatePath(`/workspaces`);
  return { success: true, taskId: task.id };
}

export async function updateTaskAction(
  taskId: string,
  data: Record<string, unknown>
): Promise<ActionResult> {
  const session = await requireSession();

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { error: "Task not found" };

  const { member } = await requireProjectAccess(task.projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const parsed = updateTaskSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.dueDate !== undefined)
    updateData.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (parsed.data.assigneeId !== undefined) updateData.assigneeId = parsed.data.assigneeId;
  if (parsed.data.columnId !== undefined) {
    const col = await prisma.boardColumn.findUnique({
      where: { id: parsed.data.columnId },
      include: { section: true },
    });
    if (!col || col.section.projectId !== task.projectId) return { error: "Invalid column" };
    const maxPos = await prisma.task.aggregate({
      where: { columnId: parsed.data.columnId },
      _max: { position: true },
    });
    updateData.columnId = parsed.data.columnId;
    updateData.position = (maxPos._max.position ?? -1) + 1;
  }

  await prisma.task.update({ where: { id: taskId }, data: updateData });

  await prisma.taskActivity.create({
    data: {
      type: "UPDATED",
      taskId,
      userId: session.userId,
      content: `updated the task`,
    },
  });

  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function moveTaskAction(data: {
  taskId: string;
  columnId: string;
  position: number;
  projectId: string;
}): Promise<ActionResult> {
  const session = await requireSession();

  const parsed = moveTaskSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { member } = await requireProjectAccess(data.projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const task = await prisma.task.findUnique({ where: { id: parsed.data.taskId } });
  if (!task) return { error: "Task not found" };

  const movedToNewColumn = task.columnId !== parsed.data.columnId;

  await prisma.$transaction(async (tx) => {
    if (movedToNewColumn) {
      await tx.task.updateMany({
        where: {
          columnId: task.columnId,
          position: { gt: task.position },
        },
        data: { position: { decrement: 1 } },
      });
      await tx.task.updateMany({
        where: {
          columnId: parsed.data.columnId,
          position: { gte: parsed.data.position },
          id: { not: parsed.data.taskId },
        },
        data: { position: { increment: 1 } },
      });
    } else {
      if (task.position < parsed.data.position) {
        await tx.task.updateMany({
          where: {
            columnId: parsed.data.columnId,
            position: { gt: task.position, lte: parsed.data.position },
            id: { not: parsed.data.taskId },
          },
          data: { position: { decrement: 1 } },
        });
      } else {
        await tx.task.updateMany({
          where: {
            columnId: parsed.data.columnId,
            position: { gte: parsed.data.position, lt: task.position },
            id: { not: parsed.data.taskId },
          },
          data: { position: { increment: 1 } },
        });
      }
    }

    await tx.task.update({
      where: { id: parsed.data.taskId },
      data: { columnId: parsed.data.columnId, position: parsed.data.position },
    });

    if (movedToNewColumn) {
      await tx.taskActivity.create({
        data: {
          type: "MOVED",
          taskId: parsed.data.taskId,
          userId: session.userId,
          content: `moved this task`,
        },
      });
    }
  });

  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function deleteTaskAction(taskId: string, projectId: string): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.task.delete({ where: { id: taskId } });

  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function addCommentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();

  const raw = {
    content: formData.get("content") as string,
    taskId: formData.get("taskId") as string,
  };

  const parsed = createCommentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const task = await prisma.task.findUnique({ where: { id: parsed.data.taskId } });
  if (!task) return { error: "Task not found" };

  const { member } = await requireProjectAccess(task.projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.taskComment.create({
    data: {
      content: parsed.data.content,
      taskId: parsed.data.taskId,
      authorId: session.userId,
    },
  });

  await prisma.taskActivity.create({
    data: {
      type: "COMMENTED",
      taskId: parsed.data.taskId,
      userId: session.userId,
      content: `commented on this task`,
    },
  });

  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function deleteCommentAction(
  commentId: string,
  projectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);

  const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });
  if (!comment) return { error: "Comment not found" };
  if (comment.authorId !== session.userId && !canEdit(member.role)) {
    return { error: "Insufficient permissions" };
  }

  await prisma.taskComment.delete({ where: { id: commentId } });
  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function addChecklistItemAction(
  data: { title: string; taskId: string; projectId: string }
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(data.projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const parsed = createChecklistItemSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const maxPos = await prisma.taskChecklistItem.aggregate({
    where: { taskId: parsed.data.taskId },
    _max: { position: true },
  });

  await prisma.taskChecklistItem.create({
    data: {
      title: parsed.data.title,
      taskId: parsed.data.taskId,
      position: (maxPos._max.position ?? -1) + 1,
    },
  });

  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function toggleChecklistItemAction(
  itemId: string,
  projectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) return { error: "Item not found" };

  await prisma.taskChecklistItem.update({
    where: { id: itemId },
    data: { completed: !item.completed },
  });

  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function deleteChecklistItemAction(
  itemId: string,
  projectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.taskChecklistItem.delete({ where: { id: itemId } });
  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function addLabelAction(
  taskId: string,
  labelId: string,
  projectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.taskLabelOnTask.upsert({
    where: { taskId_labelId: { taskId, labelId } },
    create: { taskId, labelId },
    update: {},
  });

  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function removeLabelAction(
  taskId: string,
  labelId: string,
  projectId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  await prisma.taskLabelOnTask.delete({
    where: { taskId_labelId: { taskId, labelId } },
  });

  revalidatePath(`/workspaces`);
  return { success: true };
}

export async function createLabelAction(
  projectId: string,
  data: { name: string; color: string }
): Promise<ActionResult & { labelId?: string }> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const label = await prisma.taskLabel.create({
    data: { name: data.name, color: data.color, projectId },
  });

  revalidatePath(`/workspaces`);
  return { success: true, labelId: label.id };
}
