import { requireSession, clearSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { status: true, isAdmin: true },
  });

  if (!user) {
    await clearSession();
    redirect("/login");
  }

  if (user.status === "PENDING") redirect("/pending");

  if (user.status === "SUSPENDED") {
    await clearSession();
    redirect("/login");
  }

  const [workspaces, appSettings] = await Promise.all([
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
    }),
    prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { logoBase64: true, logoMimeType: true },
    }),
  ]);

  const logoSrc =
    appSettings?.logoBase64 && appSettings?.logoMimeType
      ? `data:${appSettings.logoMimeType};base64,${appSettings.logoBase64}`
      : null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        workspaces={workspaces.map((m) => ({ ...m.workspace, role: m.role }))}
        session={session}
        isAdmin={user.isAdmin}
        logoSrc={logoSrc}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar session={session} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
