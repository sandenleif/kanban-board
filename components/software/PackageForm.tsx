"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Loader2, Upload } from "lucide-react";

export function PackageForm() {
  const router = useRouter();
  const [type, setType] = useState<"winget" | "file" | "script">("winget");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setUploading(true);
    setProgress("Wird hochgeladen...");

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/software/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Upload fehlgeschlagen");
        return;
      }
      router.push(`/software/packages/${data.id}`);
    } catch (err) {
      setError(`Netzwerkfehler: ${err}`);
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-border bg-card p-6">
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
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
          <select id="type" name="type" value={type}
            onChange={(e) => setType(e.target.value as never)}
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
            <Label htmlFor="file">EXE / MSI / ZIP Datei</Label>
            <Input id="file" name="file" type="file"
              accept=".exe,.msi,.msp,.msu,.zip" />
            <p className="text-xs text-muted-foreground">Bis 512 MB — wird direkt auf den Server gestreamt</p>
          </div>
        )}

        {type === "script" && (
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="installParams">PowerShell-Script</Label>
            <Textarea id="installParams" name="installParams" rows={8}
              placeholder={"# Beispiel: Brave per Download installieren\n$dest = \"$env:TEMP\\BraveSetup.exe\"\nInvoke-WebRequest \"https://laptop-updates.brave.com/latest/winx64\" -OutFile $dest -UseBasicParsing\nStart-Process $dest -ArgumentList \"/silent /install\" -Wait\nRemove-Item $dest -Force -ErrorAction SilentlyContinue"}
              className="font-mono text-xs" />
          </div>
        )}

        {type !== "script" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="installParams">Installations-Parameter</Label>
              <Input id="installParams" name="installParams"
                placeholder={type === "winget" ? "--source winget --silent" : "/S /NORESTART"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uninstallParams">Deinstallations-Parameter</Label>
              <Input id="uninstallParams" name="uninstallParams" placeholder="/S /UNINSTALL" />
            </div>
          </>
        )}

        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="description">Beschreibung</Label>
          <Textarea id="description" name="description" rows={2} placeholder="Optionale Beschreibung..." />
        </div>
      </div>

      <div className="flex gap-3 items-center">
        <Button type="submit" disabled={uploading}>
          {uploading
            ? <><Loader2 className="animate-spin h-4 w-4" /> {progress}</>
            : <><Upload className="h-4 w-4" /> Paket anlegen</>}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Abbrechen</Button>
      </div>
    </form>
  );
}
