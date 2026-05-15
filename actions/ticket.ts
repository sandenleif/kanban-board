"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import type { ActionResult } from "./auth";
import type { TicketStatus, TicketPriority } from "@prisma/client";
import { indexTicket, deleteTicketFromIndex } from "@/lib/elasticsearch";

async function requireOrgAdmin() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true, organizationId: true },
  });
  if (!user?.organizationId) throw new Error("No organization");
  return { session, organizationId: user.organizationId, isAdmin: user.isAdmin };
}

async function requireOrgMember() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) throw new Error("No organization");
  return { session, organizationId: user.organizationId };
}

// ── Queue management ───────────────────────────────────────────────────────

export async function createTicketQueueAction(name: string): Promise<ActionResult & { id?: string }> {
  const { organizationId } = await requireOrgAdmin();
  const max = await prisma.ticketQueue.aggregate({ where: { organizationId }, _max: { position: true } });
  const queue = await prisma.ticketQueue.create({
    data: { organizationId, name: name.trim(), position: (max._max.position ?? -1) + 1 },
  });
  revalidatePath("/helpdesk");
  return { success: true, id: queue.id };
}

export async function deleteTicketQueueAction(queueId: string): Promise<ActionResult> {
  const { organizationId } = await requireOrgAdmin();
  await prisma.ticketQueue.deleteMany({ where: { id: queueId, organizationId } });
  revalidatePath("/helpdesk");
  return { success: true };
}

// ── Team management ───────────────────────────────────────────────────────

export async function createTicketTeamAction(name: string): Promise<ActionResult & { id?: string }> {
  const { organizationId } = await requireOrgAdmin();
  const max = await prisma.ticketTeam.aggregate({ where: { organizationId }, _max: { position: true } });
  const team = await prisma.ticketTeam.create({
    data: { organizationId, name: name.trim(), position: (max._max.position ?? -1) + 1 },
  });
  revalidatePath("/helpdesk");
  revalidatePath("/admin/users");
  return { success: true, id: team.id };
}

export async function deleteTicketTeamAction(teamId: string): Promise<ActionResult> {
  const { organizationId } = await requireOrgAdmin();
  await prisma.ticketTeam.deleteMany({ where: { id: teamId, organizationId } });
  revalidatePath("/helpdesk");
  revalidatePath("/admin/users");
  return { success: true };
}

// ── Category management ────────────────────────────────────────────────────

export async function createTicketCategoryAction(name: string): Promise<ActionResult & { id?: string }> {
  const { organizationId } = await requireOrgAdmin();
  const max = await prisma.ticketCategory.aggregate({ where: { organizationId }, _max: { position: true } });
  const cat = await prisma.ticketCategory.create({
    data: { organizationId, name: name.trim(), position: (max._max.position ?? -1) + 1 },
  });
  revalidatePath("/helpdesk");
  revalidatePath("/admin/users");
  return { success: true, id: cat.id };
}

export async function deleteTicketCategoryAction(categoryId: string): Promise<ActionResult> {
  const { organizationId } = await requireOrgAdmin();
  await prisma.ticketCategory.deleteMany({ where: { id: categoryId, organizationId } });
  revalidatePath("/helpdesk");
  revalidatePath("/admin/users");
  return { success: true };
}

// ── Ticket CRUD ────────────────────────────────────────────────────────────

export async function createTicketAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult & { ticketId?: string }> {
  const { session, organizationId } = await requireOrgMember();

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const priority = (formData.get("priority") as TicketPriority) || "MEDIUM";
  const queueId = (formData.get("queueId") as string) || null;
  const teamId = (formData.get("teamId") as string) || null;
  const categoryId = (formData.get("categoryId") as string) || null;
  const assignedToId = (formData.get("assignedToId") as string) || null;
  const topic = (formData.get("topic") as string)?.trim() || null;
  const inventoryNumber = (formData.get("inventoryNumber") as string)?.trim() || null;
  const requesterType = (formData.get("requesterType") as string) || "customer";
  const fromName      = (formData.get("fromName") as string)?.trim() || null;
  const fromEmail     = (formData.get("fromEmail") as string)?.trim() || null;
  const contactId     = (formData.get("contactId") as string) || null;

  if (!title) return { error: "Titel ist erforderlich" };

  const ticket = await prisma.ticket.create({
    data: {
      title, description, priority, queueId, teamId, categoryId, assignedToId,
      topic, inventoryNumber, requesterType, organizationId, createdById: session.userId,
      fromName, fromEmail, contactId,
    },
  });

  // Index in Elasticsearch (non-blocking)
  void indexTicket({
    id: ticket.id, organizationId, number: ticket.number, title, description,
    topic, inventoryNumber, fromEmail: null, fromName: null,
    status: "OPEN", priority, queueName: null, teamName: null, assigneeName: null,
    createdAt: ticket.createdAt.toISOString(),
  });

  revalidatePath("/helpdesk");
  return { success: true, ticketId: ticket.id };
}

export async function updateTicketAction(
  ticketId: string,
  data: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedToId?: string | null;
    queueId?: string | null;
    teamId?: string | null;
    categoryId?: string | null;
    topic?: string | null;
    inventoryNumber?: string | null;
    requesterType?: string;
    title?: string;
    description?: string | null;
  }
): Promise<ActionResult> {
  const { organizationId } = await requireOrgMember();

  const closedAt = data.status === "CLOSED" || data.status === "RESOLVED" ? new Date() : undefined;

  await prisma.ticket.updateMany({
    where: { id: ticketId, organizationId },
    data: { ...data, ...(closedAt ? { closedAt } : {}) },
  });

  revalidatePath("/helpdesk");
  revalidatePath(`/helpdesk/${ticketId}`);
  return { success: true };
}

export async function deleteTicketAction(ticketId: string): Promise<ActionResult> {
  const { organizationId } = await requireOrgAdmin();
  await prisma.ticket.deleteMany({ where: { id: ticketId, organizationId } });
  void deleteTicketFromIndex(ticketId);
  revalidatePath("/helpdesk");
  return { success: true };
}

// ── Ticket comments ────────────────────────────────────────────────────────

export async function addTicketCommentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const { session, organizationId } = await requireOrgMember();

  const ticketId = formData.get("ticketId") as string;
  const content = (formData.get("content") as string)?.trim();
  const isInternal = formData.get("isInternal") === "true";

  if (!content) return { error: "Kommentar ist leer" };

  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, organizationId } });
  if (!ticket) return { error: "Ticket nicht gefunden" };

  const comment = await prisma.ticketComment.create({
    data: { ticketId, authorId: session.userId, content, isInternal },
  });

  revalidatePath(`/helpdesk/${ticketId}`);
  return { success: true, id: comment.id };
}

export async function deleteTicketCommentAction(commentId: string): Promise<ActionResult> {
  const { session } = await requireOrgMember();
  await prisma.ticketComment.deleteMany({ where: { id: commentId, authorId: session.userId } });
  revalidatePath("/helpdesk");
  return { success: true };
}

// ── Lock / Unlock ─────────────────────────────────────────────────────────

export async function lockTicketAction(ticketId: string): Promise<ActionResult> {
  const { session, organizationId } = await requireOrgMember();
  await prisma.ticket.updateMany({
    where: { id: ticketId, organizationId, locked: false },
    data: { locked: true, lockedById: session.userId, lockedAt: new Date() },
  });
  revalidatePath(`/helpdesk/${ticketId}`);
  revalidatePath("/helpdesk");
  return { success: true };
}

export async function unlockTicketAction(ticketId: string): Promise<ActionResult> {
  const { organizationId } = await requireOrgMember();
  await prisma.ticket.updateMany({
    where: { id: ticketId, organizationId },
    data: { locked: false, lockedById: null, lockedAt: null },
  });
  revalidatePath(`/helpdesk/${ticketId}`);
  revalidatePath("/helpdesk");
  return { success: true };
}

// ── Convert ticket to Kanban task ──────────────────────────────────────────

export async function convertTicketToTaskAction(
  ticketId: string,
  targetProjectId: string
): Promise<ActionResult> {
  const { session, organizationId } = await requireOrgMember();

  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, organizationId } });
  if (!ticket) return { error: "Ticket nicht gefunden" };

  const column = await prisma.boardColumn.findFirst({
    where: {
      section: { projectId: targetProjectId },
      OR: [
        { name: { equals: "Geplant", mode: "insensitive" } },
        { name: { equals: "Planned", mode: "insensitive" } },
        { name: { equals: "To Do", mode: "insensitive" } },
        { name: { equals: "Backlog", mode: "insensitive" } },
      ],
    },
    orderBy: { position: "asc" },
  }) ?? await prisma.boardColumn.findFirst({
    where: { section: { projectId: targetProjectId } },
    orderBy: [{ section: { position: "asc" } }, { position: "asc" }],
  });

  if (!column) return { error: "Kein Spalte im Zielprojekt gefunden" };

  const maxPos = await prisma.task.aggregate({ where: { columnId: column.id }, _max: { position: true } });

  const description = [
    ticket.description,
    `---`,
    `📋 Ticket #${ticket.number}: ${ticket.title}`,
    ticket.fromEmail ? `Von: ${ticket.fromName ?? ""} <${ticket.fromEmail}>` : null,
  ].filter(Boolean).join("\n\n");

  await prisma.task.create({
    data: {
      title: ticket.title,
      description,
      priority: ticket.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      columnId: column.id,
      projectId: targetProjectId,
      createdById: session.userId,
      position: (maxPos._max.position ?? -1) + 1,
      assignees: { create: { userId: session.userId } },
    },
  });

  // Mark ticket as in progress
  await prisma.ticket.updateMany({
    where: { id: ticketId, organizationId },
    data: { status: "IN_PROGRESS", linkedTaskId: targetProjectId },
  });

  revalidatePath("/helpdesk");
  revalidatePath(`/helpdesk/${ticketId}`);
  revalidatePath("/workspaces", "layout");
  return { success: true };
}

// ── Exchange / IMAP config ─────────────────────────────────────────────────

export async function saveExchangeConfigAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { organizationId } = await requireOrgAdmin();

  const host = (formData.get("host") as string)?.trim();
  const port = parseInt((formData.get("port") as string) || "993");
  const username = (formData.get("username") as string)?.trim();
  const password = (formData.get("password") as string) || "";
  const mailbox = (formData.get("mailbox") as string)?.trim() || "INBOX";
  const useSSL = formData.get("useSSL") === "true";
  const enabled = formData.get("enabled") === "true";

  if (!host) return { error: "Server-Adresse ist erforderlich" };
  if (!username) return { error: "Benutzername ist erforderlich" };

  await prisma.exchangeConfig.upsert({
    where: { organizationId },
    create: { organizationId, host, port, username, password, mailbox, useSSL, enabled },
    update: {
      host, port, username, mailbox, useSSL, enabled,
      ...(password ? { password } : {}),
    },
  });

  revalidatePath("/helpdesk");
  return { success: true };
}
