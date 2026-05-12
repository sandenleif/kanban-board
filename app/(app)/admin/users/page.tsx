import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { LogoUpload } from "@/components/admin/LogoUpload";
import { LocaleSelector } from "@/components/admin/LocaleSelector";
import { DangerZone } from "@/components/admin/DangerZone";
import { SmtpSettings } from "@/components/admin/SmtpSettings";
import { ExchangeConfigPanel } from "@/components/admin/ExchangeConfigPanel";
import { HelpdeskAdminPanel } from "@/components/admin/HelpdeskAdminPanel";
import { isFullSetup } from "@/lib/features";
import { Users, Clock, CheckCircle2, Ban } from "lucide-react";

export default async function AdminUsersPage() {
  const session = await requireSession();
  const t = await getTranslations("admin");

  const currentUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true, organizationId: true },
  });
  if (!currentUser?.isAdmin) notFound();

  const [users, appSettings, exchangeConfig, teams, categories] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: currentUser.organizationId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, email: true, status: true, isAdmin: true, createdAt: true, _count: { select: { workspaceMembers: true } } },
    }),
    prisma.appSettings.findUnique({ where: { organizationId: currentUser.organizationId! } }),
    isFullSetup
      ? prisma.exchangeConfig.findUnique({ where: { organizationId: currentUser.organizationId! } })
      : Promise.resolve(null),
    isFullSetup
      ? prisma.ticketTeam.findMany({ where: { organizationId: currentUser.organizationId! }, orderBy: { position: "asc" } })
      : Promise.resolve([]),
    isFullSetup
      ? prisma.ticketCategory.findMany({ where: { organizationId: currentUser.organizationId! }, orderBy: { position: "asc" } })
      : Promise.resolve([]),
  ]);

  const pending   = users.filter((u) => u.status === "PENDING").length;
  const active    = users.filter((u) => u.status === "ACTIVE").length;
  const suspended = users.filter((u) => u.status === "SUSPENDED").length;

  return (
    <div className="max-w-5xl mx-auto animate-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: t("pendingCount"),   value: pending,   icon: Clock,         color: "text-yellow-400", bg: "bg-yellow-400/10" },
          { label: t("activeCount"),    value: active,    icon: CheckCircle2,  color: "text-green-400",  bg: "bg-green-400/10" },
          { label: t("suspendedCount"), value: suspended, icon: Ban,           color: "text-red-400",    bg: "bg-red-400/10" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.bg}`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <LocaleSelector currentLocale={appSettings?.locale ?? "en"} />
      <LogoUpload currentLogo={appSettings} />
      {isFullSetup && (
        <ExchangeConfigPanel initial={exchangeConfig ? {
          host: exchangeConfig.host,
          port: exchangeConfig.port,
          username: exchangeConfig.username,
          mailbox: exchangeConfig.mailbox,
          useSSL: exchangeConfig.useSSL,
          enabled: exchangeConfig.enabled,
          lastCheckedAt: exchangeConfig.lastCheckedAt,
        } : null} />
      )}
      <SmtpSettings initial={{
        smtpHost: appSettings?.smtpHost ?? null,
        smtpPort: appSettings?.smtpPort ?? null,
        smtpUser: appSettings?.smtpUser ?? null,
        smtpFrom: appSettings?.smtpFrom ?? null,
        smtpSecure: appSettings?.smtpSecure ?? false,
      }} />
      {isFullSetup && <HelpdeskAdminPanel teams={teams} categories={categories} />}
      <UserManagementTable users={users} currentUserId={session.userId} />
      <DangerZone />
    </div>
  );
}
