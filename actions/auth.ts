"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, clearSession } from "@/lib/auth";
import { generateSlug } from "@/lib/utils";
import { loginSchema, registerSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { isEnterprise } from "@/lib/enterprise";
import { sendEmail } from "@/lib/email";

export type ActionResult = {
  error?: string;
  success?: boolean;
};

async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

// ─── First-run setup (creates super admin) ────────────────────────────────────

export async function setupAdminAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const count = await prisma.user.count();
  if (count > 0) return { error: "Setup already completed." };

  const raw = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const hashed = await bcrypt.hash(parsed.data.password, 12);

  if (isEnterprise) {
    // Enterprise: super admin floats above all orgs
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        password: hashed,
        status: "ACTIVE",
        isAdmin: true,
        isSuperAdmin: true,
        organizationId: null,
      },
    });
    await createSession({ userId: user.id, email: user.email, name: user.name, organizationId: null, isSuperAdmin: true });
    redirect("/super-admin");
  }

  // Standalone: create default org + admin + workspace
  const rawLocale = formData.get("locale") as string | null;
  const locale = ["en", "de", "fr", "es"].includes(rawLocale ?? "") ? rawLocale! : "en";

  const org = await prisma.organization.create({
    data: { name: "Default", slug: "default" },
  });
  await prisma.appSettings.create({ data: { organizationId: org.id, locale } });

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashed,
      status: "ACTIVE",
      isAdmin: true,
      isSuperAdmin: false,
      organizationId: org.id,
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: `${user.name}'s Workspace`,
      slug: generateSlug(`${user.name}s workspace`),
      ownerId: user.id,
      organizationId: org.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  await createSession({ userId: user.id, email: user.email, name: user.name, organizationId: org.id, isSuperAdmin: false });
  redirect(`/workspaces/${workspace.id}`);
}

// ─── Register new organization + org admin ────────────────────────────────────

export async function registerOrgAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`register-org:${ip}`, 3, 60 * 60 * 1000);
  if (!rl.allowed)
    return { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` };

  const superAdminExists = await prisma.user.findFirst({ where: { isSuperAdmin: true } });
  if (!superAdminExists) return { error: "Platform not set up yet." };

  const raw = {
    orgName: formData.get("orgName") as string,
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  if (!raw.orgName?.trim()) return { error: "Organization name is required." };
  if (!raw.name?.trim()) return { error: "Your name is required." };

  const parsed = registerSchema.safeParse({ name: raw.name, email: raw.email, password: raw.password });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "Could not create account with those details." };

  const slug = generateSlug(raw.orgName.trim());
  const slugExists = await prisma.organization.findUnique({ where: { slug } });
  if (slugExists) return { error: "An organization with a similar name already exists." };

  const hashed = await bcrypt.hash(parsed.data.password, 12);

  const org = await prisma.organization.create({
    data: { name: raw.orgName.trim(), slug },
  });

  await prisma.appSettings.create({
    data: { organizationId: org.id, locale: "en" },
  });

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashed,
      status: "ACTIVE",
      isAdmin: true,
      isSuperAdmin: false,
      organizationId: org.id,
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: `${org.name}`,
      slug: generateSlug(`${org.name} workspace`),
      ownerId: user.id,
      organizationId: org.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: org.id,
    isSuperAdmin: false,
  });
  redirect(`/workspaces/${workspace.id}`);
}

// ─── Register user into existing org ─────────────────────────────────────────

export async function registerAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed)
    return { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` };

  const orgSlug = formData.get("orgSlug") as string;

  let org;
  if (isEnterprise) {
    if (!orgSlug) return { error: "No organization specified." };
    org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org || org.status !== "ACTIVE") return { error: "Organization not found or suspended." };
  } else {
    org = await prisma.organization.findFirst();
    if (!org) return { error: "System not set up yet." };
  }

  const raw = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "Could not create account with those details." };

  const hashed = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashed,
      status: "PENDING",
      isAdmin: false,
      isSuperAdmin: false,
      organizationId: org.id,
    },
  });

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: org.id,
    isSuperAdmin: false,
  });
  redirect("/pending");
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed)
    return { error: `Too many login attempts. Try again in ${rl.retryAfterSeconds}s.` };

  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid email or password" };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  const dummyHash = "$2b$12$invalidhashfortimingattacknormalization0000000000000000";
  const valid = user
    ? await bcrypt.compare(parsed.data.password, user.password)
    : await bcrypt.compare(parsed.data.password, dummyHash).then(() => false);

  if (!user || !valid) return { error: "Invalid email or password" };

  if (user.status === "SUSPENDED") {
    return { error: "Your account has been suspended. Contact an administrator." };
  }

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: user.organizationId,
    isSuperAdmin: user.isSuperAdmin,
  });

  if (user.status === "PENDING") redirect("/pending");
  if (user.isSuperAdmin) redirect("/super-admin");
  redirect("/dashboard");
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function requestPasswordResetAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`pw-reset:${ip}`, 3, 15 * 60 * 1000);
  if (!rl.allowed) return { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` };

  const email = (formData.get("email") as string)?.toLowerCase().trim();
  if (!email || !email.includes("@")) return { error: "Invalid email address." };

  // Always succeed to avoid user enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate old tokens
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? "http";
    const resetUrl = `${proto}://${host}/reset-password?token=${token}`;

    try {
      await sendEmail(
        user.email,
        "Passwort zurücksetzen – KanbanFlow",
        `<p>Hallo ${user.name},</p>
         <p>Klicke auf den folgenden Link um dein Passwort zurückzusetzen (gültig 1 Stunde):</p>
         <p><a href="${resetUrl}">${resetUrl}</a></p>
         <p>Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>`
      );
    } catch {
      // Don't reveal email-sending failures to the user
    }
  }

  return { success: true };
}

export async function resetPasswordAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const token = (formData.get("token") as string)?.trim();
  const password = formData.get("password") as string;

  if (!token) return { error: "Ungültiger Reset-Link." };
  if (!password || password.length < 8) return { error: "Passwort muss mindestens 8 Zeichen haben." };

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "Reset-Link ist ungültig oder abgelaufen." };
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { password: hashed } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return { success: true };
}
