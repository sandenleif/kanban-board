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

type Queue = { id: string; name: string };
type OrgUser = { id: string; name: string };

const PRIORITIES = [
  { value: "LOW",    label: "Niedrig" },
  { value: "MEDIUM", label: "Mittel" },
  { value: "HIGH",   label: "Hoch" },
  { value: "URGENT", label: "Dringend" },
];

export function TicketForm({ queues, orgUsers, currentUserId }: {
  queues: Queue[];
  orgUsers: OrgUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [state, action, isPending] = useActionState(createTicketAction, {});

  useEffect(() => {
    if (state.success && state.ticketId) {
      router.push(`/helpdesk/${state.ticketId}`);
    }
  }, [state.success, state.ticketId, router]);

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-card p-6">
      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="title">Titel *</Label>
        <Input id="title" name="title" placeholder="Kurzbeschreibung des Problems" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Beschreibung</Label>
        <Textarea id="description" name="description" placeholder="Detaillierte Beschreibung…" rows={5} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priorität</Label>
          <select id="priority" name="priority" className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {queues.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="queueId">Queue</Label>
            <select id="queueId" name="queueId" className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
              <option value="">Keine Queue</option>
              {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="assignedToId">Zuweisen an</Label>
          <select id="assignedToId" name="assignedToId" defaultValue={currentUserId} className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
            <option value="">Niemanden</option>
            {orgUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
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
