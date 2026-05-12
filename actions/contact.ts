"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import type { ActionResult } from "./auth";

async function requireOrgMember() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.organizationId) throw new Error("No organization");
  return { session, organizationId: user.organizationId, isAdmin: user.isAdmin };
}

export async function createContactAction(data: {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  department?: string;
  notes?: string;
  source?: string;
  externalId?: string;
  ticketId?: string;
}): Promise<ActionResult & { id?: string }> {
  const { organizationId } = await requireOrgMember();

  if (!data.name?.trim()) return { error: "Name ist erforderlich" };

  // Upsert by email within org if email given
  const contact = data.email
    ? await prisma.ticketContact.upsert({
        where: { organizationId_email: { organizationId, email: data.email } },
        create: {
          organizationId,
          name: data.name.trim(),
          email: data.email.trim().toLowerCase(),
          phone: data.phone?.trim() || null,
          company: data.company?.trim() || null,
          department: data.department?.trim() || null,
          notes: data.notes?.trim() || null,
          source: data.source ?? "manual",
          externalId: data.externalId || null,
        },
        update: {
          name: data.name.trim(),
          ...(data.phone ? { phone: data.phone.trim() } : {}),
          ...(data.company ? { company: data.company.trim() } : {}),
          ...(data.department ? { department: data.department.trim() } : {}),
        },
      })
    : await prisma.ticketContact.create({
        data: {
          organizationId,
          name: data.name.trim(),
          phone: data.phone?.trim() || null,
          company: data.company?.trim() || null,
          department: data.department?.trim() || null,
          notes: data.notes?.trim() || null,
          source: data.source ?? "manual",
          externalId: data.externalId || null,
        },
      });

  // Link to ticket if provided
  if (data.ticketId) {
    await prisma.ticket.updateMany({
      where: { id: data.ticketId, organizationId },
      data: { contactId: contact.id },
    });
  }

  revalidatePath("/helpdesk/contacts");
  revalidatePath("/helpdesk");
  return { success: true, id: contact.id };
}

export async function updateContactAction(
  contactId: string,
  data: { name?: string; email?: string; phone?: string; company?: string; department?: string; notes?: string }
): Promise<ActionResult> {
  const { organizationId } = await requireOrgMember();
  await prisma.ticketContact.updateMany({
    where: { id: contactId, organizationId },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.email !== undefined ? { email: data.email?.trim().toLowerCase() || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.company !== undefined ? { company: data.company?.trim() || null } : {}),
      ...(data.department !== undefined ? { department: data.department?.trim() || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
    },
  });
  revalidatePath("/helpdesk/contacts");
  return { success: true };
}

export async function deleteContactAction(contactId: string): Promise<ActionResult> {
  const { organizationId } = await requireOrgMember();
  await prisma.ticketContact.deleteMany({ where: { id: contactId, organizationId } });
  revalidatePath("/helpdesk/contacts");
  return { success: true };
}

export async function linkTicketToContactAction(
  ticketId: string,
  contactId: string
): Promise<ActionResult> {
  const { organizationId } = await requireOrgMember();
  await prisma.ticket.updateMany({
    where: { id: ticketId, organizationId },
    data: { contactId },
  });
  revalidatePath(`/helpdesk/${ticketId}`);
  return { success: true };
}

// ── LDAP sync ─────────────────────────────────────────────────────────────

export async function saveLdapConfigAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { organizationId, isAdmin } = await requireOrgMember();
  if (!isAdmin) return { error: "Admin required" };

  const host = (formData.get("ldapHost") as string)?.trim();
  const port = parseInt((formData.get("ldapPort") as string) || "389");
  const bindDn = (formData.get("ldapBindDn") as string)?.trim();
  const bindPassword = (formData.get("ldapBindPassword") as string) || "";
  const baseDn = (formData.get("ldapBaseDn") as string)?.trim();
  const userFilter = (formData.get("ldapUserFilter") as string)?.trim() || "(objectClass=person)";
  const enabled = formData.get("ldapEnabled") === "true";

  if (!host) return { error: "Host ist erforderlich" };
  if (!bindDn) return { error: "Bind DN ist erforderlich" };
  if (!baseDn) return { error: "Base DN ist erforderlich" };

  await prisma.ldapConfig.upsert({
    where: { organizationId },
    create: { organizationId, host, port, bindDn, bindPassword, baseDn, userFilter, enabled },
    update: { host, port, bindDn, baseDn, userFilter, enabled, ...(bindPassword ? { bindPassword } : {}) },
  });

  revalidatePath("/admin/users");
  return { success: true };
}
