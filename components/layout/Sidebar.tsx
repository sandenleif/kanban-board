"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  ChevronDown,
  ChevronRight,
  Plus,
  Building2,
  ShieldCheck,
  User,
  Users,
  Database,
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/forms/CreateWorkspaceDialog";
import type { SessionPayload } from "@/lib/auth";
import type { WorkspaceRole } from "@prisma/client";

interface Project { id: string; name: string }
interface WorkspaceWithProjects {
  id: string; name: string; slug: string; role: WorkspaceRole; projects: Project[];
}
interface SidebarProps {
  workspaces: WorkspaceWithProjects[];
  session: SessionPayload;
  isAdmin: boolean;
  logoSrc: string | null;
  isEnterprise: boolean;
  isFullSetup: boolean;
}

export function Sidebar({ workspaces, session: _, isAdmin, logoSrc, isEnterprise, isFullSetup }: SidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    new Set(workspaces.map((w) => w.id))
  );
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);

  const toggleWorkspace = (id: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      <aside className="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border min-h-[57px]">
          {logoSrc ? (
            <img src={logoSrc} alt="Company logo" className="h-10 max-w-[160px] object-contain" />
          ) : (
            <>
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white">
                  <rect x="1" y="1" width="5" height="14" rx="1" fill="currentColor" />
                  <rect x="8" y="1" width="5" height="9" rx="1" fill="currentColor" opacity="0.7" />
                </svg>
              </div>
              <span className="font-semibold text-sm text-foreground">KanbanFlow</span>
              {isEnterprise && <span className="text-[9px] font-bold text-primary border border-primary/30 rounded px-1 leading-4">ENT</span>}
            </>
          )}
        </div>

        <nav className="flex flex-col flex-1 overflow-y-auto py-2">
          <div className="px-2 mb-1">
            <Link
              href="/dashboard"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                pathname === "/dashboard"
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              {t("dashboard")}
            </Link>
          </div>

          <div className="px-2 mb-1">
            <Link
              href="/workspaces"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                pathname === "/workspaces"
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              {t("workspaces")}
            </Link>
          </div>

          <div className="px-2 mb-1">
            <Link
              href="/personal"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                pathname === "/personal"
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <User className="h-4 w-4 shrink-0" />
              {t("personalSpace")}
            </Link>
          </div>

          {isFullSetup && (
            <>
              <div className="px-2 mb-1">
                <Link
                  href="/helpdesk"
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                    pathname.startsWith("/helpdesk") && !pathname.startsWith("/helpdesk/contacts")
                      ? "bg-sidebar-accent text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <Headphones className="h-4 w-4 shrink-0" />
                  Helpdesk
                </Link>
              </div>
              <div className="px-2 mb-1">
                <Link
                  href="/helpdesk/contacts"
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                    pathname.startsWith("/helpdesk/contacts")
                      ? "bg-sidebar-accent text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <Users className="h-4 w-4 shrink-0" />
                  Kunden
                </Link>
              </div>
            </>
          )}

          <div className="mt-4 px-4 mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              {t("workspaces")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              type="button"
              onClick={() => setShowCreateWorkspace(true)}
              title={t("newWorkspace")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="px-2 flex-1">
            {workspaces.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">{t("noWorkspaces")}</p>
            ) : (
              workspaces.map((workspace) => (
                <div key={workspace.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleWorkspace(workspace.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                      pathname.startsWith(`/workspaces/${workspace.id}`)
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {expandedWorkspaces.has(workspace.id) ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{workspace.name}</span>
                  </button>

                  {expandedWorkspaces.has(workspace.id) && (
                    <div className="ml-4 mt-0.5 space-y-0.5">
                      <Link
                        href={`/workspaces/${workspace.id}`}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                          pathname === `/workspaces/${workspace.id}`
                            ? "bg-sidebar-accent text-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                        )}
                      >
                        <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                        {t("projects")}
                      </Link>

                      {workspace.projects.map((project) => (
                        <Link
                          key={project.id}
                          href={`/workspaces/${workspace.id}/projects/${project.id}/board`}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors pl-4",
                            pathname === `/workspaces/${workspace.id}/projects/${project.id}/board`
                              ? "bg-sidebar-accent text-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                          )}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                          <span className="truncate">{project.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </nav>

        <div className="border-t border-sidebar-border px-2 py-2 space-y-0.5">
          {isAdmin && (
            <Link
              href="/admin/users"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                pathname === "/admin/users"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t("userManagement")}
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/db"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                pathname.startsWith("/admin/db")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <Database className="h-4 w-4 shrink-0" />
              Datenbank
            </Link>
          )}
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              pathname === "/settings"
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {t("settings")}
          </Link>
        </div>
      </aside>

      <CreateWorkspaceDialog
        open={showCreateWorkspace}
        onOpenChange={setShowCreateWorkspace}
      />
    </>
  );
}
