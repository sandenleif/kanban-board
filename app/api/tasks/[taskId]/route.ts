import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMember } from "@/lib/permissions";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      column: {
        include: {
          section: { include: { project: true } },
        },
      },
    },
  });

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = task.column.section.project.workspaceId;
  const member = await requireWorkspaceMember(workspaceId, session.userId).catch(() => null);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [comments, checklist, activities, attachments] = await Promise.all([
    prisma.taskComment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskChecklistItem.findMany({
      where: { taskId },
      orderBy: { position: "asc" },
    }),
    prisma.taskActivity.findMany({
      where: { taskId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.attachment.findMany({
      where: { taskId },
      select: { id: true, name: true, size: true, mimeType: true, url: true, createdAt: true, uploadedById: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({ comments, checklist, activities, attachments });
}
