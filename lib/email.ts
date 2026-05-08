import nodemailer from "nodemailer";
import { prisma } from "./prisma";

export async function getSmtpSettings() {
  return prisma.appSettings.findFirst({
    select: {
      smtpHost: true, smtpPort: true,
      smtpUser: true, smtpPassword: true,
      smtpFrom: true, smtpSecure: true,
    },
  });
}

export async function sendEmail(to: string, subject: string, html: string) {
  const cfg = await getSmtpSettings();
  if (!cfg?.smtpHost) throw new Error("SMTP not configured");

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort ?? 587,
    secure: cfg.smtpSecure ?? false,
    auth: cfg.smtpUser
      ? { user: cfg.smtpUser, pass: cfg.smtpPassword ?? "" }
      : undefined,
  });

  await transporter.sendMail({
    from: cfg.smtpFrom ?? cfg.smtpUser ?? "noreply@kanban",
    to,
    subject,
    html,
  });
}

export function isSmtpConfigured(cfg: Awaited<ReturnType<typeof getSmtpSettings>>) {
  return !!cfg?.smtpHost;
}
