"use client";

import { useActionState, useState } from "react";
import { updateSmtpSettingsAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";

type SmtpConfig = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
};

export function SmtpSettings({ initial }: { initial: SmtpConfig }) {
  const [state, action, isPending] = useActionState(updateSmtpSettingsAction, {});
  const [secure, setSecure] = useState(initial.smtpSecure);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">SMTP / E-Mail</h2>
        <span className="text-xs text-muted-foreground ml-1">für Passwort-Reset und Benachrichtigungen</span>
      </div>

      {state.success && (
        <div className="flex items-center gap-2 rounded-md bg-green-400/10 border border-green-400/20 px-3 py-2 text-sm text-green-400 mb-4">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          SMTP-Einstellungen gespeichert.
        </div>
      )}
      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="smtpHost">SMTP-Server</Label>
          <Input id="smtpHost" name="smtpHost" placeholder="smtp.gmail.com" defaultValue={initial.smtpHost ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smtpPort">Port</Label>
          <Input id="smtpPort" name="smtpPort" type="number" placeholder="587" defaultValue={initial.smtpPort ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smtpUser">Benutzername</Label>
          <Input id="smtpUser" name="smtpUser" placeholder="user@gmail.com" defaultValue={initial.smtpUser ?? ""} autoComplete="off" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smtpPassword">Passwort / App-Passwort</Label>
          <Input id="smtpPassword" name="smtpPassword" type="password" placeholder="••••••••" autoComplete="new-password" />
          <p className="text-xs text-muted-foreground">Leer lassen = unverändert</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smtpFrom">Absender-Adresse</Label>
          <Input id="smtpFrom" name="smtpFrom" placeholder="noreply@meinefirma.de" defaultValue={initial.smtpFrom ?? ""} />
        </div>

        <div className="space-y-1.5">
          <Label>Verschlüsselung</Label>
          <div className="flex gap-3 pt-1">
            {[
              { value: "false", label: "STARTTLS (Port 587)" },
              { value: "true", label: "SSL/TLS (Port 465)" },
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="smtpSecure"
                  value={opt.value}
                  checked={secure === (opt.value === "true")}
                  onChange={() => setSecure(opt.value === "true")}
                  className="accent-primary"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" disabled={isPending} className="min-w-[120px]">
            {isPending && <Loader2 className="animate-spin" />}
            Speichern
          </Button>
        </div>
      </form>
    </div>
  );
}
