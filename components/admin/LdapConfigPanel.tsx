"use client";

import { useActionState } from "react";
import { saveLdapConfigAction } from "@/actions/contact";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Database, AlertCircle, CheckCircle2 } from "lucide-react";

interface InitialConfig {
  host: string; port: number; bindDn: string; baseDn: string;
  userFilter: string; enabled: boolean; lastSyncAt: Date | null;
}

export function LdapConfigPanel({ initial }: { initial: InitialConfig | null }) {
  const [state, action, isPending] = useActionState(saveLdapConfigAction, {});

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4 text-primary" />
          Active Directory / LDAP
        </CardTitle>
        <CardDescription>
          Verbindet den Helpdesk mit Active Directory für die automatische Kontakt-Suche.
          Kontakte werden in Elasticsearch indexiert und im Ticket-Formular vorgeschlagen.
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
              <CheckCircle2 className="h-4 w-4 shrink-0" />Konfiguration gespeichert
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ldapHost">LDAP-Server (Host)</Label>
              <Input id="ldapHost" name="ldapHost" defaultValue={initial?.host} placeholder="ldap.company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ldapPort">Port</Label>
              <Input id="ldapPort" name="ldapPort" type="number" defaultValue={initial?.port ?? 389}
                placeholder="389 (LDAP) / 636 (LDAPS)" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ldapBindDn">Bind DN</Label>
              <Input id="ldapBindDn" name="ldapBindDn" defaultValue={initial?.bindDn}
                placeholder="cn=helpdesk,ou=ServiceAccounts,dc=company,dc=com" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ldapBindPassword">Bind-Passwort</Label>
              <Input id="ldapBindPassword" name="ldapBindPassword" type="password"
                placeholder={initial ? "Leer lassen = unverändert" : "Passwort"} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ldapBaseDn">Base DN</Label>
              <Input id="ldapBaseDn" name="ldapBaseDn" defaultValue={initial?.baseDn}
                placeholder="ou=Users,dc=company,dc=com" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="ldapUserFilter">User-Filter</Label>
              <Input id="ldapUserFilter" name="ldapUserFilter"
                defaultValue={initial?.userFilter ?? "(objectClass=person)"}
                placeholder="(objectClass=person)" />
              <p className="text-xs text-muted-foreground">LDAP-Filter für Benutzer-Objekte</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="ldapEnabled" value="true"
                defaultChecked={initial?.enabled ?? false} className="rounded" />
              AD-Sync aktivieren
            </label>
          </div>

          {initial?.lastSyncAt && (
            <p className="text-xs text-muted-foreground">
              Letzter Sync: {new Date(initial.lastSyncAt).toLocaleString("de-DE")}
            </p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Speichern
            </Button>
            <p className="text-xs text-muted-foreground">
              Nach dem Speichern werden AD-Kontakte beim nächsten Sync in Elasticsearch indexiert
              und im Ticket-Formular als Vorschläge angezeigt.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
