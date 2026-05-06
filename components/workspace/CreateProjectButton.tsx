"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "@/components/forms/CreateProjectDialog";
import { Plus } from "lucide-react";

export function CreateProjectButton({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("workspace");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="h-4 w-4" />
        {t("newProject")}
      </Button>
      <CreateProjectDialog workspaceId={workspaceId} open={open} onOpenChange={setOpen} />
    </>
  );
}
