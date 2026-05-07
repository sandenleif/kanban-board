import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, FolderKanban } from "lucide-react";

export default async function WorkspacesPage() {
  const session = await requireSession();
  const t = await getTranslations("workspace");

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.userId },
    include: {
      workspace: {
        include: {
          _count: { select: { members: true, projects: true } },
          projects: { where: { status: "ACTIVE" }, take: 3, orderBy: { updatedAt: "desc" } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return (
    <div className="max-w-4xl mx-auto animate-in">
      <h1 className="text-2xl font-semibold text-foreground mb-6">{t("title")}</h1>

      {memberships.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-foreground font-medium">{t("noWorkspaces")}</p>
            <p className="text-muted-foreground text-sm mt-1">{t("noWorkspacesHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {memberships.map(({ workspace, role }) => (
            <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer group h-full">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                      {workspace.name[0].toUpperCase()}
                    </div>
                    <Badge variant="secondary" className="text-xs">{role}</Badge>
                  </div>
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {workspace.name}
                  </h3>
                  {workspace.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{workspace.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {workspace._count.members}
                    </span>
                    <span className="flex items-center gap-1">
                      <FolderKanban className="h-3.5 w-3.5" />
                      {workspace._count.projects}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
