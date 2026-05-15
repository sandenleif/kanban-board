"use client";

import { useActionState, useEffect, useState } from "react";
import { updateOrganizationAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Building2, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";

interface Props {
  currentName: string;
  currentSlug: string;
}

export function OrganizationSettingsPanel({ currentName, currentSlug }: Props) {
  const [state, action, isPending] = useActionState(updateOrganizationAction, {});
  const [slug, setSlug] = useState(currentSlug);

  // Update displayed slug when save succeeds
  useEffect(() => {
    if (state.success && state.newSlug) setSlug(state.newSlug);
  }, [state.success, state.newSlug]);

  const portalUrl = `/portal/${slug}`;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" />
          Organisation
        </CardTitle>
        <CardDescription>
          Name und Portal-URL deiner Organisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {state.error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />{state.error}
            </div>
          )}
          {state.success && (
            <div className="flex items-center gap-2 rounded-md bg-green-400/10 border border-green-400/20 px-3 py-2 text-sm text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />Name gespeichert
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="orgName">Organisationsname</Label>
            <Input
              id="orgName"
              name="orgName"
              defaultValue={currentName}
              placeholder="z.B. Siloah St. Trudpert Klinikum"
              required
            />
          </div>

          <div className="rounded-md bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            Portal-URL:&nbsp;
            <a href={portalUrl} target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline font-mono">
              {portalUrl}
            </a>
          </div>

          <Button type="submit" size="sm" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
