"use client";

import { useActionState, useState } from "react";
import { saveExchangeConfigAction } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type Config = {
  host: string; port: number; username: string;
  mailbox: string; useSSL: boolean; enabled: boolean;
  lastCheckedAt: Date | null;
} | null;

export function ExchangeConfigPanel({ initial }: { initial: Config }) {
  const [state, action, isPending] = useActionState(saveExchangeConfigAction, {});
  const [useSSL, setUseSSL] = useState(initial?.useSSL ?? true);
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Exchange / IMAP E-Mail-Postfach</h2>
        <span className="text-xs text-muted-foreground ml-1">für automatische Ticket-Erstellung</span>
      </div>

      {state.success && (
        <div className="flex items-center gap-2 rounded-md bg-green-400/10 border border-green-400/20 px-3 py-2 text-sm text-green-400 mb-4">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Gespeichert.
        </div>
      )}
      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </div>
      )}

      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="host">IMAP-Server / Exchange-Host</Label>
          <Input id="host" name="host" placeholder="mail.firma.de" defaultValue={initial?.host ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="port">Port</Label>
          <Input id="port" name="port" type="number" placeholder="993" defaultValue={initial?.port ?? 993} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Benutzername / E-Mail</Label>
          <Input id="username" name="username" placeholder="helpdesk@firma.de" defaultValue={initial?.username ?? ""} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Passwort</Label>
          <Input id="password" name="password" type="password" placeholder="••••••••" autoComplete="new-password" />
          <p className="text-xs text-muted-foreground">Leer lassen = unverändert</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mailbox">Postfach / Ordner</Label>
          <Input id="mailbox" name="mailbox" placeholder="INBOX" defaultValue={initial?.mailbox ?? "INBOX"} />
        </div>

        <div className="space-y-3 sm:col-span-2">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={useSSL} onChange={(e) => setUseSSL(e.target.checked)} name="useSSL" value="true" className="accent-primary" />
              SSL/TLS verwenden
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} name="enabled" value="true" className="accent-primary" />
              E-Mail-Abruf aktivieren
            </label>
          </div>
          {initial?.lastCheckedAt && (
            <p className="text-xs text-muted-foreground">Zuletzt abgerufen: {initial.lastCheckedAt.toLocaleString("de-DE")}</p>
          )}
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
