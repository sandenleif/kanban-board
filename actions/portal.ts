"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createPortalSession, clearPortalSession, getPortalSession } from "@/lib/portal-auth";
import { requireSession } from "@/lib/auth";
import { ldapAuthenticate } from "@/lib/ldap";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./auth";

// ── Portal login ──────────────────────────────────────────────────────────

export async function portalLoginAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const orgSlug = formData.get("orgSlug") as string;
  const email   = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "E-Mail und Passwort erforderlich" };

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true, status: true, ldapConfig: true },
  });
  if (!org || org.status !== "ACTIVE") return { error: "Organisation nicht gefunden" };

  const portalUser = await prisma.portalUser.findUnique({
    where: { organizationId_email: { organizationId: org.id, email } },
  });

  // 1. Try manual (password) login
  if (portalUser?.passwordHash) {
    const valid = await bcrypt.compare(password, portalUser.passwordHash);
    if (!valid) return { error: "E-Mail oder Passwort falsch" };
    if (portalUser.status !== "ACTIVE") return { error: "Konto gesperrt. Bitte Admin kontaktieren." };

    await createPortalSession({
      portalUserId: portalUser.id,
      name: portalUser.name,
      email: portalUser.email,
      organizationId: org.id,
      orgSlug: org.slug,
    });
    redirect(`/portal/${orgSlug}`);
  }

  // 2. Try LDAP login if configured
  if (org.ldapConfig?.enabled) {
    const ldapResult = await ldapAuthenticate(org.ldapConfig, email, password);
    if (ldapResult) {
      // Auto-create or update portal user from LDAP
      const upserted = await prisma.portalUser.upsert({
        where: { organizationId_email: { organizationId: org.id, email } },
        create: {
          organizationId: org.id,
          name: ldapResult.name || email.split("@")[0],
          email,
          ldapUsername: ldapResult.username,
          status: "ACTIVE",
        },
        update: { name: ldapResult.name || email.split("@")[0], ldapUsername: ldapResult.username },
      });

      await createPortalSession({
        portalUserId: upserted.id,
        name: upserted.name,
        email: upserted.email,
        organizationId: org.id,
        orgSlug: org.slug,
      });
      redirect(`/portal/${orgSlug}`);
    }
    return { error: "Anmeldung fehlgeschlagen. Bitte prüfen Sie Ihre Zugangsdaten." };
  }

  return { error: "E-Mail oder Passwort falsch" };
}


export async function portalLogoutAction(orgSlug: string) {
  await clearPortalSession();
  redirect(`/portal/${orgSlug}/login`);
}

// ── Portal ticket actions ─────────────────────────────────────────────────

export async function createPortalTicketAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult & { ticketId?: string }> {
  const session = await getPortalSession();
  if (!session) return { error: "Nicht angemeldet" };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const priority = (formData.get("priority") as string) || "MEDIUM";
  const categoryId = (formData.get("categoryId") as string) || null;

  if (!title) return { error: "Titel ist erforderlich" };

  // Find the first available column in any active project
  const column = await prisma.boardColumn.findFirst({
    where: {
      section: {
        project: {
          workspace: { organizationId: session.organizationId },
          status: "ACTIVE",
        },
      },
      OR: [{ name: { equals: "Backlog", mode: "insensitive" } }, { name: { equals: "To Do", mode: "insensitive" } }],
    },
    orderBy: { position: "asc" },
  });

  const ticket = await prisma.ticket.create({
    data: {
      title,
      description,
      priority: priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      organizationId: session.organizationId,
      fromName: session.name,
      fromEmail: session.email,
      requesterType: "customer",
      categoryId: categoryId || null,
      createdById: (await prisma.user.findFirst({ where: { organizationId: session.organizationId, isAdmin: true } }))?.id ?? session.portalUserId,
    },
  });

  revalidatePath(`/portal/${session.orgSlug}`);
  return { success: true, ticketId: ticket.id };
}

// ── Admin: manage portal users ────────────────────────────────────────────

export async function createPortalUserAction(data: {
  name: string;
  email: string;
  password?: string;
  contactId?: string;
}): Promise<ActionResult & { id?: string }> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { organizationId: true, isAdmin: true } });
  if (!user?.isAdmin || !user.organizationId) return { error: "Kein Zugriff" };

  if (!data.name?.trim() || !data.email?.trim()) return { error: "Name und E-Mail erforderlich" };

  const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : null;

  const portalUser = await prisma.portalUser.upsert({
    where: { organizationId_email: { organizationId: user.organizationId, email: data.email.trim().toLowerCase() } },
    create: {
      organizationId: user.organizationId,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      passwordHash,
      contactId: data.contactId || null,
      status: "ACTIVE",
    },
    update: {
      name: data.name.trim(),
      ...(passwordHash ? { passwordHash } : {}),
      ...(data.contactId ? { contactId: data.contactId } : {}),
    },
  });

  revalidatePath("/helpdesk/contacts");
  revalidatePath("/admin/users");
  return { success: true, id: portalUser.id };
}

export async function suspendPortalUserAction(portalUserId: string): Promise<ActionResult> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { organizationId: true, isAdmin: true } });
  if (!user?.isAdmin || !user.organizationId) return { error: "Kein Zugriff" };

  await prisma.portalUser.updateMany({
    where: { id: portalUserId, organizationId: user.organizationId },
    data: { status: "SUSPENDED" },
  });
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deletePortalUserAction(portalUserId: string): Promise<ActionResult> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { organizationId: true, isAdmin: true } });
  if (!user?.isAdmin || !user.organizationId) return { error: "Kein Zugriff" };

  await prisma.portalUser.deleteMany({ where: { id: portalUserId, organizationId: user.organizationId } });
  revalidatePath("/admin/users");
  return { success: true };
}
