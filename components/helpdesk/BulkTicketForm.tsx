"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBulkTicketsAction } from "@/actions/ticket";
import { toast } from "sonner";
import type { TicketPriority } from "@prisma/client";

type Queue   = { id: string; name: string };
type Team    = { id: string; name: string };
type OrgUser = { id: string; name: string };

interface TicketRow {
  title: string;
  priority: TicketPriority;
  queueId: string;
  teamId: string;
  assignedToId: string;
  topic: string;
  inventoryNumber: string;
}

const EMPTY_ROW = (): TicketRow => ({
  title: "", priority: "MEDIUM", queueId: "", teamId: "",
  assignedToId: "", topic: "", inventoryNumber: "",
});

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "LOW", label: "Niedrig" },
  { value: "MEDIUM", label: "Mittel" },
  { value: "HIGH", label: "Hoch" },
  { value: "URGENT", label: "Dringend" },
];

export function BulkTicketForm({ queues, teams, orgUsers, currentUserId }: {
  queues: Queue[]; teams: Team[]; orgUsers: OrgUser[]; currentUserId: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<TicketRow[]>([EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()]);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const update = (idx: number, field: keyof TicketRow, value: string) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows((prev) => [...prev, EMPTY_ROW()]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    const valid = rows.filter((r) => r.title.trim());
    if (!valid.length) { toast.error("Mindestens ein Titel ist erforderlich"); return; }

    startTransition(async () => {
      const result = await createBulkTicketsAction(valid);
      if (result.error) { toast.error(result.error); return; }
      toast.success(`${result.count} Ticket(s) erstellt`);
      setDone(true);
      setTimeout(() => router.push("/helpdesk?view=list"), 1500);
    });
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-green-400">
        <CheckCircle2 className="h-12 w-12" />
        <p className="text-lg font-semibold">Tickets erstellt</p>
        <p className="text-sm text-muted-foreground">Weiterleitung…</p>
      </div>
    );
  }

  const thCls = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th className={thCls + " w-8"} aria-label="Nr">#</th>
              <th className={thCls}>Titel *</th>
              <th className={thCls + " w-28"}>Priorität</th>
              {queues.length > 0 && <th className={thCls + " w-32"}>Queue</th>}
              {teams.length > 0  && <th className={thCls + " w-32"}>Team</th>}
              <th className={thCls + " w-36"}>Zuweisen an</th>
              <th className={thCls + " w-36"}>Thema</th>
              <th className={thCls + " w-36"}>Inventarnummer</th>
              <th className="w-8 px-2 py-2" aria-label="Löschen" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-muted/10">
                <td className="px-3 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                <td className="px-2 py-1.5">
                  <Input value={row.title} onChange={(e) => update(idx, "title", e.target.value)}
                    placeholder="Titel eingeben…" className="h-7 text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <select aria-label="Priorität" value={row.priority} onChange={(e) => update(idx, "priority", e.target.value)}
                    className="w-full h-7 rounded-md border border-border bg-background text-xs px-2">
                    {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </td>
                {queues.length > 0 && (
                  <td className="px-2 py-1.5">
                    <select aria-label="Queue" value={row.queueId} onChange={(e) => update(idx, "queueId", e.target.value)}
                      className="w-full h-7 rounded-md border border-border bg-background text-xs px-2">
                      <option value="">—</option>
                      {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                    </select>
                  </td>
                )}
                {teams.length > 0 && (
                  <td className="px-2 py-1.5">
                    <select aria-label="Team" value={row.teamId} onChange={(e) => update(idx, "teamId", e.target.value)}
                      className="w-full h-7 rounded-md border border-border bg-background text-xs px-2">
                      <option value="">—</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                )}
                <td className="px-2 py-1.5">
                  <select aria-label="Zuweisen" value={row.assignedToId || currentUserId} onChange={(e) => update(idx, "assignedToId", e.target.value)}
                    className="w-full h-7 rounded-md border border-border bg-background text-xs px-2">
                    <option value="">—</option>
                    {orgUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <Input value={row.topic} onChange={(e) => update(idx, "topic", e.target.value)}
                    placeholder="Thema…" className="h-7 text-xs" />
                </td>
                <td className="px-2 py-1.5">
                  <Input value={row.inventoryNumber} onChange={(e) => update(idx, "inventoryNumber", e.target.value)}
                    placeholder="INV-…" className="h-7 text-xs font-mono" />
                </td>
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => removeRow(idx)} disabled={rows.length <= 1}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" /> Zeile hinzufügen
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>Abbrechen</Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {rows.filter((r) => r.title.trim()).length} Ticket(s) erstellen
          </Button>
        </div>
      </div>
    </div>
  );
}
