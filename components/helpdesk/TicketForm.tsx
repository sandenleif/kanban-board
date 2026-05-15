"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createTicketAction } from "@/actions/ticket";
import { updateContactAction } from "@/actions/contact";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, User, Mail, Phone, Building2, LayoutList, StickyNote } from "lucide-react";
import { ContactSearch, type SelectedContactData } from "./ContactSearch";
import { toast } from "sonner";

type Queue    = { id: string; name: string };
type Team     = { id: string; name: string };
type Category = { id: string; name: string };
type OrgUser  = { id: string; name: string };

const PRIORITIES = [
  { value: "LOW",    label: "Niedrig" },
  { value: "MEDIUM", label: "Mittel" },
  { value: "HIGH",   label: "Hoch" },
  { value: "URGENT", label: "Dringend" },
];

const REQUESTER_TYPES = [
  { value: "customer",  label: "Kunde" },
  { value: "employee",  label: "IT-Mitarbeiter" },
  { value: "team",      label: "Team-intern" },
];

export function TicketForm({ queues, teams, categories, orgUsers, currentUserId, hasElastic = false }: {
  queues: Queue[];
  teams: Team[];
  categories: Category[];
  orgUsers: OrgUser[];
  currentUserId: string;
  hasElastic?: boolean;
}) {
  const router = useRouter();
  const [state, action, isPending] = useActionState(createTicketAction, {});
  const [contact, setContact] = useState<SelectedContactData | null>(null);
  const [contactPhone, setContactPhone] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.success && state.ticketId) router.push(`/helpdesk/${state.ticketId}`);
  }, [state.success, state.ticketId, router]);

  const handleContactSelected = (c: SelectedContactData | null) => {
    setContact(c);
    setContactPhone(c ? (c.phone || c.mobile || "") : "");
  };

  const savePhone = (val: string) => {
    if (!contact?.id || val === contactPhone) return;
    startTransition(async () => {
      await updateContactAction(contact.id!, { phone: val || undefined });
      toast.success("Telefonnummer gespeichert");
    });
  };

  return (
    <div className="flex gap-6 items-start">
      {/* ── Left: main form ── */}
      <form action={action} className="flex-1 space-y-5 rounded-xl border border-border bg-card p-6">
        {state.error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />{state.error}
          </div>
        )}

        {/* Requester */}
        <div className="space-y-1.5">
          <Label>Anfragesteller</Label>
          <ContactSearch hasElastic={hasElastic} onContactSelected={handleContactSelected} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Titel *</Label>
          <Input id="title" name="title" placeholder="Kurzbeschreibung des Problems" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Beschreibung</Label>
          <Textarea id="description" name="description" placeholder="Detaillierte Beschreibung…" rows={4} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="requesterType">Anfragesteller-Typ</Label>
            <select id="requesterType" name="requesterType" aria-label="Anfragesteller-Typ" className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
              {REQUESTER_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="priority">Priorität</Label>
            <select id="priority" name="priority" aria-label="Priorität" className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="categoryId">Kategorie</Label>
              <select id="categoryId" name="categoryId" aria-label="Kategorie" className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
                <option value="">Keine Kategorie</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {queues.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="queueId">Queue</Label>
              <select id="queueId" name="queueId" aria-label="Queue" className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
                <option value="">Keine Queue</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>
          )}

          {teams.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="teamId">Team</Label>
              <select id="teamId" name="teamId" aria-label="Team" className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
                <option value="">Kein Team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="assignedToId">Zuweisen an</Label>
            <select id="assignedToId" name="assignedToId" aria-label="Zuweisen an" defaultValue={currentUserId} className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
              <option value="">Niemanden</option>
              {orgUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inventoryNumber">Inventarnummer</Label>
            <Input id="inventoryNumber" name="inventoryNumber" placeholder="z.B. INV-2024-0042" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="animate-spin h-4 w-4" />}
            Ticket erstellen
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Abbrechen</Button>
        </div>
      </form>

      {/* ── Right: contact card ── */}
      <div className="w-64 shrink-0 sticky top-6">
        {contact ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <User className="h-3 w-3" /> Kundendaten
              </h3>
              {contact.source === "ad" && (
                <span className="text-[10px] text-primary bg-primary/10 rounded px-1.5 py-0.5">AD</span>
              )}
            </div>
            <div className="px-4 py-3 space-y-2.5 text-xs">

              {/* Name */}
              <div className="flex items-start gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <span className="font-medium text-foreground">{contact.name}</span>
              </div>

              {/* E-Mail */}
              {contact.email && (
                <div className="flex items-start gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <a href={`mailto:${contact.email}`} className="text-primary hover:underline break-all">
                    {contact.email}
                  </a>
                </div>
              )}

              {/* Telefon — editierbar */}
              <div className="flex items-start gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
                <input
                  className="flex-1 h-6 rounded border border-transparent hover:border-border focus:border-border bg-transparent focus:bg-background text-foreground text-xs px-1.5 transition-colors outline-none min-w-0"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  onBlur={(e) => savePhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  placeholder="Telefonnummer…"
                />
                {contactPhone && (
                  <a href={`tel:${contactPhone}`} className="text-primary text-xs mt-0.5 shrink-0 hover:underline">↗</a>
                )}
              </div>

              {/* Firma */}
              {contact.company && (
                <div className="flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-foreground">{contact.company}</span>
                </div>
              )}

              {/* Abteilung */}
              {contact.department && (
                <div className="flex items-start gap-2">
                  <LayoutList className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-foreground">{contact.department}</span>
                </div>
              )}

              {/* Position/Titel */}
              {contact.title && (
                <div className="flex items-start gap-2">
                  <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{contact.title}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
            <User className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Kontakt auswählen um Kundendaten anzuzeigen</p>
          </div>
        )}
      </div>
    </div>
  );
}
