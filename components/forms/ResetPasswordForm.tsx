"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    (_prev: { error?: string; success?: boolean }, fd: FormData) => {
      fd.set("token", token);
      return resetPasswordAction(_prev, fd);
    },
    {}
  );

  if (state.success) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md bg-green-400/10 border border-green-400/20 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Passwort geändert</p>
            <p className="text-xs text-muted-foreground mt-0.5">Du kannst dich jetzt mit deinem neuen Passwort einloggen.</p>
          </div>
        </div>
        <Link href="/login">
          <Button className="w-full">Zum Login</Button>
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="password">Neues Passwort</Label>
        <Input id="password" name="password" type="password" placeholder="Min. 8 Zeichen" autoComplete="new-password" required minLength={8} />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="animate-spin" />}
        Passwort speichern
      </Button>
    </form>
  );
}
