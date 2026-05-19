import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { TitleSetter } from "@/components/layout/TitleSetter";
import { isEnterprise, isFullSetup } from "@/lib/features";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { status: true, isAdmin: true, avatarPath: true, avatarBase64: true },
  });

  if (!user) redirect("/login");

  if (user.status === "PENDING") redirect("/pending");
  if (user.status === "SUSPENDED") redirect("/login");

  // Enterprise: super admin has their own panel
  if (session.isSuperAdmin) redirect("/super-admin");

  if (!session.organizationId) redirect("/login");

  const [workspaces, appSettings, notifications] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId: session.userId },
      include: {
        workspace: {
          include: {
            projects: {
              where: { status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
      take: 50,
    }),
    prisma.appSettings.findUnique({
      where: { organizationId: session.organizationId! },
      select: { logoPath: true, logoBase64: true, siteTitle: true },
    }),
    prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const logoSrc =
    (appSettings?.logoPath || appSettings?.logoBase64)
      ? `/api/files/logo`
      : null;

  const avatarSrc =
    (user.avatarPath || user.avatarBase64)
      ? `/api/files/avatar/${session.userId}`
      : null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        workspaces={workspaces.map((m) => ({ ...m.workspace, role: m.role }))}
        session={session}
        isAdmin={user.isAdmin}
        logoSrc={logoSrc}
        isEnterprise={isEnterprise}
        isFullSetup={isFullSetup}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TitleSetter siteTitle={appSettings?.siteTitle} />
        <Topbar session={session} avatarSrc={avatarSrc} notifications={notifications} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
        <footer className="shrink-0 border-t border-border px-6 py-2 text-center text-xs text-muted-foreground">
          KanbanFlow &middot; powered by{" "}
          <a
            href="https://sanden-hosting.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            sanden-hosting.org
          </a>
        </footer>
      </div>
    </div>
  );
}
