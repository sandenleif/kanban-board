"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, Search, X, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityLabel } from "./TicketBadges";
import { formatDate } from "@/lib/utils";
import type { TicketStatus, TicketPriority } from "@prisma/client";

type TicketRow = {
  id: string; number: number; title: string;
  status: TicketStatus; priority: TicketPriority;
  createdAt: Date; fromEmail: string | null; fromName: string | null;
  createdBy: { name: string };
  assignedTo: { name: string } | null;
  queue: { name: string } | null;
  _count: { comments: number };
};

type Queue = { id: string; name: string };
type OrgUser = { id: string; name: string };

interface Filters { status?: string; priority?: string; queue?: string; q?: string }

interface Props {
  tickets: TicketRow[];
  queues: Queue[];
  orgUsers: OrgUser[];
  currentFilters: Filters;
  isAdmin: boolean;
}

const STATUSES: { value: TicketStatus | ""; label: string }[] = [
  { value: "", label: "Alle" },
  { value: "OPEN", label: "Offen" },
  { value: "IN_PROGRESS", label: "In Bearbeitung" },
  { value: "PENDING", label: "Ausstehend" },
  { value: "RESOLVED", label: "Gelöst" },
  { value: "CLOSED", label: "Geschlossen" },
];

export function TicketList({ tickets, queues, currentFilters }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(currentFilters.q ?? "");
  const [, startTransition] = useTransition();

  const applyFilter = (key: string, value: string) => {
    const params = new URLSearchParams();
    if (currentFilters.status) params.set("status", currentFilters.status);
    if (currentFilters.priority) params.set("priority", currentFilters.priority);
    if (currentFilters.queue) params.set("queue", currentFilters.queue);
    if (currentFilters.q) params.set("q", currentFilters.q);
    if (value) params.set(key, value); else params.delete(key);
    startTransition(() => router.push(`/helpdesk?${params}`));
  };

  const doSearch = () => applyFilter("q", search);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => applyFilter("status", s.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                (currentFilters.status ?? "") === s.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {queues.length > 0 && (
          <select
            className="h-8 rounded-md border border-border bg-background text-xs px-2"
            value={currentFilters.queue ?? ""}
            onChange={(e) => applyFilter("queue", e.target.value)}
          >
            <option value="">Alle Queues</option>
            {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
        )}

        <div className="flex gap-1 ml-auto">
          <Input
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            className="h-8 w-48 text-xs"
          />
          <Button size="sm" className="h-8" onClick={doSearch}><Search className="h-3.5 w-3.5" /></Button>
          {(currentFilters.status || currentFilters.queue || currentFilters.q) && (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setSearch(""); router.push("/helpdesk"); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Ticket table */}
      {tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Inbox className="h-10 w-10 opacity-30" />
          <p className="text-sm">Keine Tickets gefunden</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Titel</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Priorität</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Queue</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">Zugewiesen</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Erstellt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">#{ticket.number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/helpdesk/${ticket.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                      {ticket.title}
                    </Link>
                    {ticket.fromEmail && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                        {ticket.fromName ?? ticket.fromEmail}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell"><StatusBadge status={ticket.status} /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><PriorityLabel priority={ticket.priority} /></td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{ticket.queue?.name ?? "—"}</td>
                  <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">{ticket.assignedTo?.name ?? "—"}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {formatDate(ticket.createdAt)}
                      {ticket._count.comments > 0 && (
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          {ticket._count.comments}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
