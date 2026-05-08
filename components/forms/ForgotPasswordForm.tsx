"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function ForgotPasswordForm() {
  const [state, action, isPending] = useActionState(requestPasswordResetAction, {});

  if (state.success) {
    return (
      <div className="flex items-start gap-3 rounded-md bg-green-400/10 border border-green-400/20 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">E-Mail gesendet</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Falls diese E-Mail registriert ist, erhältst du in Kürze einen Reset-Link. Prüfe auch deinen Spam-Ordner.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" placeholder="du@beispiel.de" autoComplete="email" required />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="animate-spin" />}
        Reset-Link senden
      </Button>
    </form>
  );
}
