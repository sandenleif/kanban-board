"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Search, X, Inbox, ChevronLeft, ChevronRight, MessageSquare, Tag, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, PRIORITY_DOT } from "./TicketBadges";
import { ticketAge } from "@/lib/utils";
import type { TicketStatus, TicketPriority } from "@prisma/client";

type TicketRow = {
  id: string; number: number; title: string;
  status: TicketStatus; priority: TicketPriority;
  locked: boolean; createdAt: Date;
  topic: string | null; inventoryNumber: string | null;
  fromEmail: string | null; fromName: string | null;
  createdBy: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
  lockedBy: { id: string; name: string } | null;
  queue: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  _count: { comments: number };
};

type Queue   = { id: string; name: string };
type Team    = { id: string; name: string };
type OrgUser = { id: string; name: string };

interface Filters {
  status?: string; priority?: string; queue?: string; team?: string;
  topic?: string; inventoryNumber?: string; q?: string;
}

interface Props {
  tickets: TicketRow[];
  queues: Queue[];
  teams: Team[];
  orgUsers: OrgUser[];
  currentFilters: Filters;
  isAdmin: boolean;
  totalCount: number;
  page: number;
  limit: number;
}

const STATUSES = [
  { value: "",            label: "Alle" },
  { value: "OPEN",        label: "Offen" },
  { value: "IN_PROGRESS", label: "In Bearbeitung" },
  { value: "PENDING",     label: "Ausstehend" },
  { value: "RESOLVED",    label: "Gelöst" },
  { value: "CLOSED",      label: "Geschlossen" },
];

export function TicketList({ tickets, queues, teams, currentFilters, totalCount, page, limit }: Props) {
  const router = useRouter();
  const [search, setSearch]       = useState(currentFilters.q ?? "");
  const [topicF, setTopicF]       = useState(currentFilters.topic ?? "");
  const [invF,   setInvF]         = useState(currentFilters.inventoryNumber ?? "");
  const [, startTransition]       = useTransition();
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const hasActiveFilter = !!(
    currentFilters.status || currentFilters.queue || currentFilters.team ||
    currentFilters.topic  || currentFilters.inventoryNumber || currentFilters.q
  );

  const buildParams = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ view: "list" });
    const carry: Record<string, string | undefined> = {
      status: currentFilters.status,
      queue: currentFilters.queue,
      team: currentFilters.team,
      topic: currentFilters.topic,
      inventoryNumber: currentFilters.inventoryNumber,
      q: currentFilters.q,
    };
    Object.entries(carry).forEach(([k, v]) => { if (v) p.set(k, v); });
    Object.entries(overrides).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
    return `/helpdesk?${p}`;
  };

  const applyFilter = (key: string, value: string) =>
    startTransition(() => router.push(buildParams({ [key]: value, page: "1" })));

  const clearAll = () => {
    setSearch(""); setTopicF(""); setInvF("");
    startTransition(() => router.push("/helpdesk?view=list"));
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Status tabs */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-0 rounded-lg border border-border overflow-hidden text-xs font-medium">
          {STATUSES.map((s) => (
            <button key={s.value} type="button" onClick={() => applyFilter("status", s.value)}
              className={`px-3 py-1.5 transition-colors ${(currentFilters.status ?? "") === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {queues.length > 0 && (
            <select aria-label="Queue" className="h-8 rounded-md border border-border bg-background text-xs px-2"
              value={currentFilters.queue ?? ""} onChange={(e) => applyFilter("queue", e.target.value)}>
              <option value="">Alle Queues</option>
              {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          )}
          {teams.length > 0 && (
            <select aria-label="Team" className="h-8 rounded-md border border-border bg-background text-xs px-2"
              value={currentFilters.team ?? ""} onChange={(e) => applyFilter("team", e.target.value)}>
              <option value="">Alle Teams</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}

          {/* Topic search */}
          <div className="flex gap-1">
            <div className="relative">
              <Tag className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input placeholder="Thema…" value={topicF} onChange={(e) => setTopicF(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilter("topic", topicF)}
                className="h-8 w-32 text-xs pl-6" />
            </div>
            <div className="relative">
              <Hash className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input placeholder="Inventar…" value={invF} onChange={(e) => setInvF(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilter("inventoryNumber", invF)}
                className="h-8 w-32 text-xs pl-6" />
            </div>
          </div>

          {/* Full-text search */}
          <div className="flex gap-1">
            <Input placeholder="Suchen…" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter("q", search)} className="h-8 w-40 text-xs" />
            <Button size="sm" className="h-8 w-8 p-0" onClick={() => applyFilter("q", search)}>
              <Search className="h-3.5 w-3.5" />
            </Button>
            {hasActiveFilter && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={clearAll}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Count + pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {totalCount > 0
            ? `${(page - 1) * limit + 1}–${Math.min(page * limit, totalCount)} von ${totalCount} Tickets`
            : "0 Tickets"}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page <= 1}
              onClick={() => startTransition(() => router.push(buildParams({ page: String(page - 1) })))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return (
                <button type="button" key={p}
                  onClick={() => startTransition(() => router.push(buildParams({ page: String(p) })))}
                  className={`w-6 h-6 rounded text-[11px] font-medium transition-colors ${p === page ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {p}
                </button>
              );
            })}
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= totalPages}
              onClick={() => startTransition(() => router.push(buildParams({ page: String(page + 1) })))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Inbox className="h-10 w-10 opacity-30" />
          <p className="text-sm">Keine Tickets gefunden</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b border-border">
                <th className="w-4 px-3 py-2.5" aria-label="Priorität" />
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide">Ticket#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide w-24">Alter</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Absender</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide">Titel</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Thema</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Inventar#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Status</th>
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell w-12" aria-label="Sperrung">
                  <Lock className="h-3 w-3 inline" />
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Queue</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Team</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Besitzer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5"><PRIORITY_DOT priority={ticket.priority} /></td>
                  <td className="px-3 py-2.5 font-mono text-muted-foreground">
                    <Link href={`/helpdesk/${ticket.id}`} className="hover:text-primary transition-colors">
                      #{String(ticket.number).padStart(4, "0")}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{ticketAge(ticket.createdAt)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell max-w-[120px]">
                    <span className="truncate block">{ticket.fromName ?? ticket.fromEmail ?? ticket.createdBy.name}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/helpdesk/${ticket.id}`} className="font-medium text-foreground hover:text-primary transition-colors line-clamp-1">
                      {ticket.title}
                    </Link>
                    {ticket._count.comments > 0 && (
                      <span className="flex items-center gap-0.5 text-muted-foreground mt-0.5 md:hidden">
                        <MessageSquare className="h-2.5 w-2.5" />{ticket._count.comments}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell">
                    {ticket.topic
                      ? <button type="button" onClick={() => applyFilter("topic", ticket.topic!)}
                          className="hover:text-primary transition-colors">{ticket.topic}</button>
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden xl:table-cell">
                    {ticket.inventoryNumber
                      ? <button type="button" onClick={() => applyFilter("inventoryNumber", ticket.inventoryNumber!)}
                          className="font-mono hover:text-primary transition-colors">{ticket.inventoryNumber}</button>
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell"><StatusBadge status={ticket.status} /></td>
                  <td className="px-3 py-2.5 text-center hidden md:table-cell">
                    {ticket.locked
                      ? <span title={`Gesperrt von ${ticket.lockedBy?.name}`}><Lock className="h-3 w-3 text-yellow-400 inline" /></span>
                      : <span className="text-muted-foreground/30 text-[10px]">frei</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell">{ticket.queue?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden xl:table-cell">{ticket.team?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden xl:table-cell">{ticket.assignedTo?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
