"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { generateSlug } from "@/lib/utils";
import { requireWorkspaceMember, requireWorkspaceRole, canAdmin } from "@/lib/permissions";
import {
  createWorkspaceSchema,
  inviteMemberSchema,
} from "@/lib/validations/workspace";
import type { ActionResult } from "./auth";

export async function createWorkspaceAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();

  const raw = {
    name: formData.get("name") as string,
    description: formData.get("description") as string,
  };

  const parsed = createWorkspaceSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const { name, description } = parsed.data;

  const workspace = await prisma.workspace.create({
    data: {
      name,
      description: description || null,
      slug: generateSlug(name),
      ownerId: session.userId,
      members: {
        create: { userId: session.userId, role: "OWNER" },
      },
    },
  });

  revalidatePath("/dashboard");
  redirect(`/workspaces/${workspace.id}`);
}

export async function updateWorkspaceAction(
  workspaceId: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId);

  if (!canAdmin(member.role)) return { error: "Insufficient permissions" };

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  if (!name || name.length < 2) return { error: "Name must be at least 2 characters" };

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name, description: description || null },
  });

  revalidatePath(`/workspaces/${workspaceId}/settings`);
  return { success: true };
}

export async function deleteWorkspaceAction(
  workspaceId: string
): Promise<ActionResult> {
  const session = await requireSession();
  await requireWorkspaceRole(workspaceId, session.userId, "OWNER");

  await prisma.workspace.delete({ where: { id: workspaceId } });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function inviteMemberAction(
  workspaceId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await requireSession();
  const member = await requireWorkspaceMember(workspaceId, session.userId);

  if (!canAdmin(member.role)) return { error: "Insufficient permissions" };

  const raw = {
    email: formData.get("email") as string,
    role: formData.get("role") as string,
  };

  const parsed = inviteMemberSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return { error: "User not found. They need to register first." };

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (existing) return { error: "User is already a member" };

  await prisma.workspaceMember.create({
    data: { workspaceId, userId: user.id, role: parsed.data.role },
  });

  revalidatePath(`/workspaces/${workspaceId}/settings`);
  return { success: true };
}

export async function removeMemberAction(
  workspaceId: string,
  memberId: string
): Promise<ActionResult> {
  const session = await requireSession();
  const myMember = await requireWorkspaceMember(workspaceId, session.userId);

  if (!canAdmin(myMember.role)) return { error: "Insufficient permissions" };

  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) return { error: "Member not found" };
  if (target.role === "OWNER") return { error: "Cannot remove workspace owner" };

  await prisma.workspaceMember.delete({ where: { id: memberId } });

  revalidatePath(`/workspaces/${workspaceId}/settings`);
  return { success: true };
}

export async function updateMemberRoleAction(
  workspaceId: string,
  memberId: string,
  role: string
): Promise<ActionResult> {
  const session = await requireSession();
  await requireWorkspaceRole(workspaceId, session.userId, "OWNER", "ADMIN");

  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) return { error: "Member not found" };
  if (target.role === "OWNER") return { error: "Cannot change owner role" };
  if (!["ADMIN", "MEMBER", "VIEWER"].includes(role)) return { error: "Invalid role" };

  await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { role: role as "ADMIN" | "MEMBER" | "VIEWER" },
  });

  revalidatePath(`/workspaces/${workspaceId}/settings`);
  return { success: true };
}
