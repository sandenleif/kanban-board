"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteProjectAction } from "@/actions/project";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { WorkspaceRole } from "@prisma/client";
import { canAdmin } from "@/lib/utils";

interface Project { id: string; name: string }

export function ProjectActionsMenu({ project, workspaceId, userRole }: { project: Project; workspaceId: string; userRole: WorkspaceRole }) {
  const t = useTranslations("workspace");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm(t("confirmDeleteProject", { name: project.name }))) return;
    startTransition(async () => {
      const result = await deleteProjectAction(project.id);
      if (result?.error) toast.error(result.error);
      else { toast.success(t("projectDeleted")); router.refresh(); }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.preventDefault()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/workspaces/${workspaceId}/projects/${project.id}/board`}>
            <ExternalLink className="h-4 w-4" />
            {t("openBoard")}
          </Link>
        </DropdownMenuItem>
        {canAdmin(userRole) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="h-4 w-4" />
              {t("deleteProject")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
