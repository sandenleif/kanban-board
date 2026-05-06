import { WorkspaceRole } from "@prisma/client";
import { prisma } from "./prisma";

type WorkspaceMemberWithWorkspace = NonNullable<
  Awaited<ReturnType<typeof prisma.workspaceMember.findUnique>>
> & { workspace: Awaited<ReturnType<typeof prisma.workspace.findUniqueOrThrow>> };

type ProjectRecord = Awaited<ReturnType<typeof prisma.project.findUniqueOrThrow>>;

export async function getWorkspaceMember(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: true },
  });
}

export async function requireWorkspaceMember(workspaceId: string, userId: string) {
  const member = await getWorkspaceMember(workspaceId, userId);
  if (!member) throw new Error("Access denied: not a workspace member");
  return member;
}

export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  ...roles: WorkspaceRole[]
) {
  const member = await requireWorkspaceMember(workspaceId, userId);
  if (!roles.includes(member.role)) {
    throw new Error(`Access denied: required role ${roles.join(" or ")}`);
  }
  return member;
}

export function canEdit(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MEMBER";
}

export function canAdmin(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export async function requireProjectAccess(
  projectId: string,
  userId: string
): Promise<{ project: ProjectRecord; member: WorkspaceMemberWithWorkspace }> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  const member = await requireWorkspaceMember(project.workspaceId, userId);
  return { project, member: member as WorkspaceMemberWithWorkspace };
}
