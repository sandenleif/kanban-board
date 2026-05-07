"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, clearSession } from "@/lib/auth";
import { generateSlug } from "@/lib/utils";
import { loginSchema, registerSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/ratelimit";

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

// ─── First-run setup ──────────────────────────────────────────────────────────

export async function setupAdminAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  // Only callable when zero users exist
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
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashed,
      status: "ACTIVE",   // Admin is immediately active
      isAdmin: true,
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: `${user.name}'s Workspace`,
      slug: generateSlug(`${user.name}s workspace`),
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  const rawLocale = formData.get("locale") as string | null;
  const locale = ["en", "de", "fr", "es"].includes(rawLocale ?? "") ? rawLocale! : "en";
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", locale },
    update: { locale },
  });

  await createSession({ userId: user.id, email: user.email, name: user.name });
  redirect(`/workspaces/${workspace.id}`);
}

// ─── Register (creates PENDING user) ─────────────────────────────────────────

export async function registerAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const ip = await getClientIp();
  const rl = checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed)
    return { error: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.` };

  const raw = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  // Must have at least one admin before users can register
  const adminExists = await prisma.user.findFirst({ where: { isAdmin: true } });
  if (!adminExists) return { error: "System not set up yet." };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "Could not create account with those details." };

  const hashed = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: hashed,
      status: "PENDING", // Must be approved by admin
      isAdmin: false,
    },
  });

  await createSession({ userId: user.id, email: user.email, name: user.name });
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

  await createSession({ userId: user.id, email: user.email, name: user.name });

  if (user.status === "PENDING") {
    redirect("/pending");
  }

  redirect("/dashboard");
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
