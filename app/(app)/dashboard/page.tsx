import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ListTodo,
  TrendingUp,
  FolderKanban,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, isOverdue, PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await requireSession();

  const [myTasks, workspaceMembers, taskStats] = await Promise.all([
    prisma.task.findMany({
      where: {
        OR: [{ createdById: session.userId }, { assigneeId: session.userId }],
        column: {
          section: { project: { status: "ACTIVE" } },
        },
      },
      include: {
        column: {
          include: {
            section: {
              include: { project: { include: { workspace: true } } },
            },
          },
        },
        labels: { include: { label: true } },
        assignee: true,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 20,
    }),
    prisma.workspaceMember.findMany({
      where: { userId: session.userId },
      include: {
        workspace: {
          include: {
            projects: {
              where: { status: "ACTIVE" },
            },
            _count: { select: { members: true } },
          },
        },
      },
    }),
    prisma.task.groupBy({
      by: ["priority"],
      where: {
        OR: [{ createdById: session.userId }, { assigneeId: session.userId }],
        column: { section: { project: { status: "ACTIVE" } } },
      },
      _count: { id: true },
    }),
  ]);

  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const openTasks = myTasks.filter((t) => t.column.name !== "Done");
  const doneTasks = myTasks.filter((t) => t.column.name === "Done");
  const overdueTasks = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);
  const dueSoonTasks = openTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= soon
  );

  const stats = [
    { label: "Open Tasks", value: openTasks.length, icon: ListTodo, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Completed", value: doneTasks.length, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10" },
    { label: "Due Soon", value: dueSoonTasks.length, icon: Clock, color: "text-yellow-400", bg: "bg-yellow-400/10" },
    { label: "Overdue", value: overdueTasks.length, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-400/10" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Good {getGreeting()},{" "}
          <span className="text-primary">{session.name.split(" ")[0]}</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here&apos;s what&apos;s happening across your workspaces.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{stat.value}</p>
                </div>
                <div className={`p-2.5 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            My Tasks
          </h2>

          {openTasks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-1">No open tasks assigned to you.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {openTasks.slice(0, 10).map((task) => {
                const project = task.column.section.project;
                const workspace = project.workspace;
                return (
                  <Link
                    key={task.id}
                    href={`/workspaces/${workspace.id}/projects/${project.id}/board`}
                  >
                    <Card className="hover:border-primary/30 transition-colors cursor-pointer group">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                              {task.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">
                                {workspace.name} · {project.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                in <em>{task.column.name}</em>
                              </span>
                            </div>
                            {task.labels.length > 0 && (
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                {task.labels.slice(0, 3).map(({ label }) => (
                                  <span
                                    key={label.id}
                                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                                    style={{ backgroundColor: label.color + "20", color: label.color }}
                                  >
                                    {label.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>
                              {PRIORITY_LABELS[task.priority]}
                            </span>
                            {task.dueDate && (
                              <span className={`text-xs ${isOverdue(task.dueDate) ? "text-red-400" : "text-muted-foreground"}`}>
                                {isOverdue(task.dueDate) ? "Overdue · " : ""}
                                {formatDate(task.dueDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-primary" />
            My Workspaces
          </h2>

          {workspaceMembers.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No workspaces yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {workspaceMembers.map(({ workspace, role }) => (
                <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
                  <Card className="hover:border-primary/30 transition-colors cursor-pointer group">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {workspace.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {workspace.projects.length} project
                            {workspace.projects.length !== 1 ? "s" : ""} ·{" "}
                            {workspace._count.members} member
                            {workspace._count.members !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {role}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {taskStats.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-foreground mb-3">Tasks by Priority</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  {taskStats.map((s) => (
                    <div key={s.priority} className="flex items-center justify-between">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[s.priority]}`}>
                        {PRIORITY_LABELS[s.priority]}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        {s._count.id}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
