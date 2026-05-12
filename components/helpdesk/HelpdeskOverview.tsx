"use client";

import Link from "next/link";
import { Lock, TriangleAlert } from "lucide-react";
import { ticketAge } from "@/lib/utils";
import { PRIORITY_DOT } from "./TicketBadges";
import type { TicketStatus, TicketPriority } from "@prisma/client";

type TicketRow = {
  id: string; number: number; title: string;
  status: TicketStatus; priority: TicketPriority;
  locked: boolean; createdAt: Date;
  queue: { name: string } | null;
  assignedTo: { name: string } | null;
  createdBy: { name: string };
  lockedBy: { name: string } | null;
};

type Team = { id: string; name: string };

interface Props {
  statusMap: Record<string, number>;
  escalatedTickets: TicketRow[];
  newTickets: TicketRow[];
  inProgressTickets: TicketRow[];
  created7: Date[];
  closed7: Date[];
  teamStats: Record<string, number>;
  teams: Team[];
}

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function buildDayData(dates: Date[]): number[] {
  const counts = new Array(7).fill(0);
  const now = new Date();
  dates.forEach((d) => {
    const diffDays = Math.floor((now.getTime() - new Date(d).getTime()) / 86400000);
    const idx = 6 - Math.min(diffDays, 6);
    counts[idx]++;
  });
  return counts;
}

function MiniChart({ created, closed }: { created: Date[]; closed: Date[] }) {
  const c1 = buildDayData(created);
  const c2 = buildDayData(closed);
  const max = Math.max(...c1, ...c2, 1);
  const W = 280;
  const H = 100;
  const pad = { l: 24, r: 8, t: 8, b: 24 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;
  const xStep = chartW / 6;

  const toPath = (data: number[]) =>
    data.map((v, i) => `${i === 0 ? "M" : "L"} ${pad.l + i * xStep} ${pad.t + chartH - (v / max) * chartH}`).join(" ");

  const toArea = (data: number[]) =>
    `${toPath(data)} L ${pad.l + 6 * xStep} ${pad.t + chartH} L ${pad.l} ${pad.t + chartH} Z`;

  const dayLabels = (() => {
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      labels.push(DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]);
    }
    return labels;
  })();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Grid lines */}
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={pad.l} x2={W - pad.r} y1={pad.t + chartH * (1 - t)} y2={pad.t + chartH * (1 - t)}
          stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} />
      ))}
      {/* Area fills */}
      <path d={toArea(c1)} fill="#ef4444" opacity={0.15} />
      <path d={toArea(c2)} fill="#22c55e" opacity={0.15} />
      {/* Lines */}
      <path d={toPath(c1)} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeLinejoin="round" />
      <path d={toPath(c2)} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeLinejoin="round" />
      {/* X labels */}
      {dayLabels.map((l, i) => (
        <text key={i} x={pad.l + i * xStep} y={H - 6} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.4}>{l}</text>
      ))}
    </svg>
  );
}

function TicketSection({ title, tickets, emptyText, badge }: {
  title: string;
  tickets: TicketRow[];
  emptyText: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          {title}
          {badge}
          <span className="text-xs text-muted-foreground font-normal">({tickets.length})</span>
        </h2>
        <Link href="/helpdesk?view=list" className="text-xs text-primary hover:underline">Alle anzeigen</Link>
      </div>
      {tickets.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">{emptyText}</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="w-4 px-3 py-1.5" aria-label="Priorität" />
              <th className="px-3 py-1.5 text-left font-medium w-36">TICKET#</th>
              <th className="px-3 py-1.5 text-left font-medium w-24">ALTER</th>
              <th className="px-3 py-1.5 text-left font-medium">TITEL</th>
              <th className="px-3 py-1.5 text-left font-medium hidden lg:table-cell">QUEUE</th>
              <th className="px-3 py-1.5 text-left font-medium hidden xl:table-cell">BESITZER</th>
              <th className="px-3 py-1.5 text-center font-medium w-8 hidden md:table-cell" aria-label="Sperrung">
                <Lock className="h-3 w-3 inline" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/helpdesk/${t.id}`}>
                <td className="px-3 py-2"><PRIORITY_DOT priority={t.priority} /></td>
                <td className="px-3 py-2 font-mono text-muted-foreground">#{String(t.number).padStart(4, "0")}</td>
                <td className="px-3 py-2 text-muted-foreground">{ticketAge(t.createdAt)}</td>
                <td className="px-3 py-2 font-medium text-foreground line-clamp-1">{t.title}</td>
                <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">{t.queue?.name ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground hidden xl:table-cell">{t.assignedTo?.name ?? "—"}</td>
                <td className="px-3 py-2 text-center hidden md:table-cell">
                  {t.locked && <span title={`Gesperrt von ${t.lockedBy?.name}`}><Lock className="h-3 w-3 text-muted-foreground inline" /></span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function HelpdeskOverview({ statusMap, escalatedTickets, newTickets, inProgressTickets, created7, closed7, teamStats }: Props) {
  const open = statusMap["OPEN"] ?? 0;
  const inProgress = statusMap["IN_PROGRESS"] ?? 0;
  const pending = statusMap["PENDING"] ?? 0;
  const resolved = statusMap["RESOLVED"] ?? 0;
  const closed = statusMap["CLOSED"] ?? 0;
  const total = open + inProgress + pending + resolved + closed;

  return (
    <div className="flex gap-5 h-full overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto space-y-5 min-w-0">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Offen", value: open, color: "text-blue-400", bg: "bg-blue-400/10", href: "?view=list&status=OPEN" },
            { label: "In Bearbeitung", value: inProgress, color: "text-yellow-400", bg: "bg-yellow-400/10", href: "?view=list&status=IN_PROGRESS" },
            { label: "Ausstehend", value: pending, color: "text-orange-400", bg: "bg-orange-400/10", href: "?view=list&status=PENDING" },
            { label: "Gelöst", value: resolved, color: "text-green-400", bg: "bg-green-400/10", href: "?view=list&status=RESOLVED" },
            { label: "Gesamt", value: total, color: "text-muted-foreground", bg: "bg-muted", href: "?view=list" },
          ].map((s) => (
            <Link key={s.label} href={s.href} className="rounded-xl border border-border bg-card p-3 hover:border-primary/30 transition-colors">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className={`text-xs font-medium mt-0.5 ${s.color}`}>{s.label}</p>
            </Link>
          ))}
        </div>

        {/* Requester type breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: "customer",  label: "Kunden",          color: "text-blue-400",   bg: "bg-blue-400/10",   href: "?view=list&requesterType=customer" },
            { key: "employee",  label: "IT-Mitarbeiter",  color: "text-purple-400", bg: "bg-purple-400/10", href: "?view=list&requesterType=employee" },
            { key: "team",      label: "Team-intern",     color: "text-teal-400",   bg: "bg-teal-400/10",   href: "?view=list&requesterType=team" },
          ].map((s) => (
            <Link key={s.key} href={s.href} className="rounded-xl border border-border bg-card p-3 hover:border-primary/30 transition-colors">
              <p className="text-2xl font-bold text-foreground">{teamStats[s.key] ?? 0}</p>
              <p className={`text-xs font-medium mt-0.5 ${s.color}`}>{s.label}</p>
              <p className="text-[10px] text-muted-foreground">offen</p>
            </Link>
          ))}
        </div>

        <TicketSection
          title="Eskalierte Tickets"
          tickets={escalatedTickets}
          emptyText="Keine eskalierten Tickets"
          badge={escalatedTickets.length > 0 ? <TriangleAlert className="h-3.5 w-3.5 text-red-400" /> : undefined}
        />
        <TicketSection title="Neue Tickets" tickets={newTickets} emptyText="Keine neuen Tickets" />
        <TicketSection title="In Bearbeitung" tickets={inProgressTickets} emptyText="Keine Tickets in Bearbeitung" />
      </div>

      {/* Right panel */}
      <div className="w-64 shrink-0 space-y-4 overflow-y-auto">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-foreground">7-Tage-Statistik</h3>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Erstellt</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Geschlossen</span>
            </div>
          </div>
          <MiniChart created={created7} closed={closed7} />
        </div>
      </div>
    </div>
  );
}
