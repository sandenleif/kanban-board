"use client";

import { useActionState } from "react";
import { portalLoginAction } from "@/actions/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";

export function PortalLoginForm({ orgSlug }: { orgSlug: string }) {
  const [state, action, isPending] = useActionState(portalLoginAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orgSlug" value={orgSlug} />

      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Benutzername oder E-Mail</Label>
        <Input id="email" name="email" type="text" placeholder="vorname.nachname" required autoComplete="username" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <Input id="password" name="password" type="password" placeholder="••••••••" required autoComplete="current-password" />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Anmelden
      </Button>
    </form>
  );
}
