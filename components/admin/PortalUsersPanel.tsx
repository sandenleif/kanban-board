"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Ban, Loader2, KeyRound, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createPortalUserAction, deletePortalUserAction, suspendPortalUserAction } from "@/actions/portal";
import { toast } from "sonner";

type PortalUser = { id: string; name: string; email: string; status: string; ldapUsername: string | null; contact: { name: string } | null };

export function PortalUsersPanel({ users: initial, orgSlug }: { users: PortalUser[]; orgSlug: string }) {
  const [users, setUsers] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [isPending, startTransition] = useTransition();

  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portal/${orgSlug}/login` : `/portal/${orgSlug}/login`;

  const handleCreate = () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error("Name und E-Mail erforderlich"); return; }
    startTransition(async () => {
      const r = await createPortalUserAction({ name: form.name, email: form.email, password: form.password || undefined });
      if (r.error) { toast.error(r.error); return; }
      setUsers((prev) => [...prev, { id: r.id!, name: form.name, email: form.email.toLowerCase(), status: "ACTIVE", ldapUsername: null, contact: null }]);
      setForm({ name: "", email: "", password: "" });
      setShowForm(false);
      toast.success("Portal-Benutzer angelegt");
    });
  };

  const handleSuspend = (id: string) => {
    startTransition(async () => {
      const r = await suspendPortalUserAction(id);
      if (r.error) { toast.error(r.error); return; }
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, status: "SUSPENDED" } : u));
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    startTransition(async () => {
      const r = await deletePortalUserAction(id);
      if (r.error) { toast.error(r.error); return; }
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast.success("Portal-Benutzer gelöscht");
    });
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-primary" />
          Kundenportal-Benutzer
        </CardTitle>
        <CardDescription className="space-y-1">
          <span>Kunden melden sich unter diesem Link an:</span>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">{portalUrl}</code>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1"
              onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success("Link kopiert"); }}>
              <LinkIcon className="h-3 w-3" /> Kopieren
            </Button>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showForm ? (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Neuen Portal-Benutzer anlegen
          </Button>
        ) : (
          <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/20">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pName">Name</Label>
                <Input id="pName" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Max Mustermann" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pEmail">E-Mail</Label>
                <Input id="pEmail" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="max@firma.de" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="pPassword">Passwort <span className="text-muted-foreground font-normal">(leer = nur AD-Login)</span></Label>
                <Input id="pPassword" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mindestens 8 Zeichen" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Anlegen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Abbrechen</Button>
            </div>
          </div>
        )}

        {users.length > 0 && (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}{u.ldapUsername ? " · AD" : ""}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs rounded-full px-2 py-0.5 ${u.status === "ACTIVE" ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"}`}>
                    {u.status === "ACTIVE" ? "Aktiv" : "Gesperrt"}
                  </span>
                  {u.status === "ACTIVE" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-500 hover:text-yellow-500"
                      onClick={() => handleSuspend(u.id)} disabled={isPending} title="Sperren">
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(u.id, u.name)} disabled={isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
