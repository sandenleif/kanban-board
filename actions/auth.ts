"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, clearSession } from "@/lib/auth";
import { generateSlug } from "@/lib/utils";
import { loginSchema, registerSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { isEnterprise } from "@/lib/enterprise";

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
