import { cn } from "@/lib/utils";
import type { TicketStatus, TicketPriority } from "@prisma/client";

export const STATUS_CONFIG: Record<TicketStatus, { label: string; cls: string }> = {
  OPEN:        { label: "Offen",        cls: "bg-blue-400/10 text-blue-400 border-blue-400/20" },
  IN_PROGRESS: { label: "In Bearbeitung", cls: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20" },
  PENDING:     { label: "Ausstehend",   cls: "bg-orange-400/10 text-orange-400 border-orange-400/20" },
  RESOLVED:    { label: "Gelöst",       cls: "bg-green-400/10 text-green-400 border-green-400/20" },
  CLOSED:      { label: "Geschlossen",  cls: "bg-muted text-muted-foreground border-border" },
};

export const PRIORITY_CONFIG: Record<TicketPriority, { label: string; cls: string }> = {
  LOW:    { label: "Niedrig",  cls: "text-blue-400" },
  MEDIUM: { label: "Mittel",   cls: "text-yellow-400" },
  HIGH:   { label: "Hoch",     cls: "text-orange-400" },
  URGENT: { label: "Dringend", cls: "text-red-400 font-semibold" },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: TicketPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return <span className={cn("text-xs font-medium", cfg.cls)}>{cfg.label}</span>;
}

const PRIORITY_DOT_COLOR: Record<TicketPriority, string> = {
  LOW:    "bg-blue-400",
  MEDIUM: "bg-gray-400",
  HIGH:   "bg-orange-400",
  URGENT: "bg-red-500",
};

export function PRIORITY_DOT({ priority }: { priority: TicketPriority }) {
  return <span className={cn("inline-block w-2.5 h-2.5 rounded-sm shrink-0", PRIORITY_DOT_COLOR[priority])} title={PRIORITY_CONFIG[priority].label} />;
}
