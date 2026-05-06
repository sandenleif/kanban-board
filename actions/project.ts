"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireWorkspaceMember, requireProjectAccess, canEdit, canAdmin } from "@/lib/permissions";
import { createProjectSchema, updateProjectSchema } from "@/lib/validations/project";
import type { ActionResult } from "./auth";

const DEFAULT_COLUMNS = [
  { name: "Backlog", position: 0, color: "#64748b" },
  { name: "To Do", position: 1, color: "#3b82f6" },
  { name: "In Progress", position: 2, color: "#f59e0b" },
  { name: "Review", position: 3, color: "#8b5cf6" },
  { name: "Done", position: 4, color: "#22c55e" },
];

export async function createProjectAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();

  const raw = {
    name: formData.get("name") as string,
    description: formData.get("description") as string,
    workspaceId: formData.get("workspaceId") as string,
  };

  const parsed = createProjectSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const member = await requireWorkspaceMember(parsed.data.workspaceId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      workspaceId: parsed.data.workspaceId,
      createdById: session.userId,
      // Every new project starts with one default "General" section
      sections: {
        create: {
          name: "General",
          position: 0,
          columns: { create: DEFAULT_COLUMNS },
        },
      },
    },
  });

  revalidatePath(`/workspaces/${parsed.data.workspaceId}`);
  redirect(`/workspaces/${parsed.data.workspaceId}/projects/${project.id}/board`);
}

export async function updateProjectAction(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();
  const { member } = await requireProjectAccess(projectId, session.userId);
  if (!canEdit(member.role)) return { error: "Insufficient permissions" };

  const raw = {
    name: formData.get("name") as string || undefined,
    description: formData.get("description") as string || undefined,
    status: formData.get("status") as string || undefined,
  };

  const parsed = updateProjectSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const project = await prisma.project.update({
    where: { id: projectId },
    data: parsed.data,
  });

  revalidatePath(`/workspaces/${project.workspaceId}`);
  return { success: true };
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult> {
  const session = await requireSession();
  const { project, member } = await requireProjectAccess(projectId, session.userId);
  if (!canAdmin(member.role)) return { error: "Insufficient permissions" };

  await prisma.project.delete({ where: { id: projectId } });

  revalidatePath(`/workspaces/${project.workspaceId}`);
  redirect(`/workspaces/${project.workspaceId}`);
}
