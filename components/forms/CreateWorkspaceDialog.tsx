"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createWorkspaceAction } from "@/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertCircle, Loader2 } from "lucide-react";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({ open, onOpenChange }: CreateWorkspaceDialogProps) {
  const t = useTranslations("workspace");
  const [state, action, isPending] = useActionState(createWorkspaceAction, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createDesc")}</DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          {state.error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {state.error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ws-name">{t("wsName")}</Label>
            <Input id="ws-name" name="name" placeholder={t("wsNamePlaceholder")} required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ws-desc">{t("optionalDesc")}</Label>
            <Textarea id="ws-desc" name="description" placeholder={t("wsDescPlaceholder")} rows={3} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              {t("createWorkspace")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
