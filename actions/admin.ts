"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession, clearSession } from "@/lib/auth";
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

export async function approveUserAction(userId: string): Promise<ActionResult> {
  await requireAdmin();

  await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function suspendUserAction(userId: string): Promise<ActionResult> {
  await requireAdmin();

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (target?.isAdmin) return { error: "Cannot suspend another admin." };

  await prisma.user.update({
    where: { id: userId },
    data: { status: "SUSPENDED" },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function reactivateUserAction(userId: string): Promise<ActionResult> {
  await requireAdmin();

  await prisma.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (userId === session.userId) return { error: "Cannot delete your own account." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (target?.isAdmin) return { error: "Cannot delete another admin." };

  await prisma.user.delete({ where: { id: userId } });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function promoteToAdminAction(userId: string): Promise<ActionResult> {
  await requireAdmin();

  await prisma.user.update({
    where: { id: userId },
    data: { isAdmin: true },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function resetDatabaseAction(): Promise<ActionResult> {
  const session = await requireAdmin();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return { error: "No organization found." };

  const orgId = user.organizationId;

  // Delete all data belonging to this organization
  const workspaces = await prisma.workspace.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((w) => w.id);

  const projects = await prisma.project.findMany({
    where: { workspaceId: { in: workspaceIds } },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  const tasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  const taskIds = tasks.map((t) => t.id);

  await prisma.$transaction([
    prisma.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.taskComment.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.taskChecklistItem.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.taskLabelOnTask.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.taskAssignee.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.attachment.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.notification.deleteMany({ where: { userId: { in: [] } } }), // handled via cascade
    prisma.task.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.taskLabel.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.boardColumn.deleteMany({ where: { section: { projectId: { in: projectIds } } } }),
    prisma.projectSection.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.project.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
    prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
    prisma.workspace.deleteMany({ where: { organizationId: orgId } }),
    prisma.user.deleteMany({ where: { organizationId: orgId } }),
    prisma.appSettings.deleteMany({ where: { organizationId: orgId } }),
    prisma.organization.delete({ where: { id: orgId } }),
  ]);

  await clearSession();
  redirect("/register/org");
}
