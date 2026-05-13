"use client";

import { useActionState, useState } from "react";
import { portalLogoutAction, createPortalTicketAction } from "@/actions/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LogOut, Plus, X, MessageSquare, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { ticketAge } from "@/lib/utils";
import type { TicketStatus } from "@prisma/client";
import type { PortalSession } from "@/lib/portal-auth";

type Ticket = {
  id: string; number: number; title: string; status: TicketStatus; priority: string;
  createdAt: Date; queue: { name: string } | null; category: { name: string } | null;
  _count: { comments: number };
};
type Category = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Offen", IN_PROGRESS: "In Bearbeitung", PENDING: "Ausstehend",
  RESOLVED: "Gelöst", CLOSED: "Geschlossen",
};
const STATUS_COLOR: Record<string, string> = {
  OPEN: "text-blue-400", IN_PROGRESS: "text-yellow-400",
  PENDING: "text-orange-400", RESOLVED: "text-green-400", CLOSED: "text-muted-foreground",
};

export function PortalDashboard({ session, orgSlug, orgName, logoSrc, tickets, categories }: {
  session: PortalSession;
  orgSlug: string;
  orgName: string;
  logoSrc: string | null;
  tickets: Ticket[];
  categories: Category[];
}) {
  const [showNew, setShowNew] = useState(false);
  const [newState, newAction, newPending] = useActionState(createPortalTicketAction, {});

  const handleLogout = () => {
    portalLogoutAction(orgSlug);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoSrc
            ? <img src={logoSrc} alt={orgName} className="h-8 object-contain" />
            : <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
                  <rect x="1" y="1" width="5" height="14" rx="1" fill="currentColor" />
                  <rect x="8" y="1" width="5" height="9" rx="1" fill="currentColor" opacity="0.7" />
                </svg>
              </div>
          }
          <div>
            <p className="font-semibold text-sm text-foreground">{orgName}</p>
            <p className="text-xs text-muted-foreground">Kundenportal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{session.name}</span>
          <form action={handleLogout}>
            <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
              <LogOut className="h-4 w-4" /> Abmelden
            </Button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Meine Tickets</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{tickets.length} Ticket(s)</p>
          </div>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> Neues Ticket
          </Button>
        </div>

        {/* New ticket form */}
        {showNew && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Neues Ticket erstellen</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowNew(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form action={newAction} className="space-y-3">
              {newState.error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />{newState.error}
                </div>
              )}
              {newState.success && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" />Ticket erstellt
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="title">Betreff *</Label>
                <Input id="title" name="title" placeholder="Kurze Beschreibung des Problems" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea id="description" name="description" placeholder="Details zum Problem…" rows={4} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="priority">Priorität</Label>
                  <select id="priority" name="priority" aria-label="Priorität"
                    className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
                    <option value="LOW">Niedrig</option>
                    <option value="MEDIUM" selected>Mittel</option>
                    <option value="HIGH">Hoch</option>
                    <option value="URGENT">Dringend</option>
                  </select>
                </div>
                {categories.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="categoryId">Kategorie</Label>
                    <select id="categoryId" name="categoryId" aria-label="Kategorie"
                      className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
                      <option value="">Keine</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={newPending}>
                  {newPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Absenden
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowNew(false)}>Abbrechen</Button>
              </div>
            </form>
          </div>
        )}

        {/* Ticket list */}
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <CheckCircle2 className="h-10 w-10 opacity-30" />
            <p className="text-sm">Noch keine Tickets vorhanden</p>
            <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4" /> Erstes Ticket erstellen</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">#{String(t.number).padStart(4, "0")}</span>
                      {t.category && <span className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5">{t.category.name}</span>}
                    </div>
                    <p className="font-medium text-foreground">{t.title}</p>
                    {t.queue && <p className="text-xs text-muted-foreground mt-0.5">{t.queue.name}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-xs font-medium ${STATUS_COLOR[t.status]}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{ticketAge(t.createdAt)}</span>
                      {t._count.comments > 0 && (
                        <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{t._count.comments}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
