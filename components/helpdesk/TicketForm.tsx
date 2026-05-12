"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createTicketAction } from "@/actions/ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { ContactSearch } from "./ContactSearch";

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

  useEffect(() => {
    if (state.success && state.ticketId) router.push(`/helpdesk/${state.ticketId}`);
  }, [state.success, state.ticketId, router]);

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-card p-6">
      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{state.error}
        </div>
      )}

      {/* Requester */}
      <div className="space-y-1.5">
        <Label>Anfragesteller</Label>
        <ContactSearch hasElastic={hasElastic} />
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
        {/* Requester type */}
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
  );
}
