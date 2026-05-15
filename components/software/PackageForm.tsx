"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPackageAction } from "@/actions/software";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Loader2 } from "lucide-react";

export function PackageForm() {
  const router = useRouter();
  const [state, action, isPending] = useActionState(createPackageAction, {});
  const [type, setType] = useState<"winget" | "file" | "script">("winget");

  useEffect(() => {
    if (state.success && state.id) router.push(`/software/packages/${state.id}`);
  }, [state.success, state.id, router]);

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-card p-6" encType="multipart/form-data">
      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{state.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="name">Paketname *</Label>
          <Input id="name" name="name" placeholder="z.B. Google Chrome" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="version">Version</Label>
          <Input id="version" name="version" placeholder="z.B. 120.0" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Typ</Label>
          <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as never)}
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
            <option value="winget">winget (Microsoft Store/winget)</option>
            <option value="file">Datei (EXE / MSI hochladen)</option>
            <option value="script">PowerShell-Script</option>
          </select>
        </div>

        {type === "winget" && (
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="wingetId">winget-ID</Label>
            <Input id="wingetId" name="wingetId" placeholder="z.B. Google.Chrome" />
            <p className="text-xs text-muted-foreground">Zu finden mit: <code className="bg-muted px-1 rounded">winget search Chrome</code></p>
          </div>
        )}

        {type === "file" && (
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="file">EXE / MSI Datei (max. 512 MB)</Label>
            <Input id="file" name="file" type="file" accept=".exe,.msi,.msp,.msu" />
          </div>
        )}

        {type === "script" && (
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="installParams">PowerShell-Script</Label>
            <Textarea id="installParams" name="installParams" rows={6}
              placeholder={"# PowerShell Script\nwinget install --id Notepad++.Notepad++ --silent\n"} className="font-mono text-xs" />
          </div>
        )}

        {type !== "script" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="installParams">Installations-Parameter</Label>
              <Input id="installParams" name="installParams" placeholder="/S /NORESTART" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uninstallParams">Deinstallations-Parameter</Label>
              <Input id="uninstallParams" name="uninstallParams" placeholder="/S /UNINSTALL" />
            </div>
          </>
        )}

        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="description">Beschreibung</Label>
          <Textarea id="description" name="description" rows={2} placeholder="Optionale Beschreibung…" />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin h-4 w-4" />}
          Paket anlegen
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Abbrechen</Button>
      </div>
    </form>
  );
}
