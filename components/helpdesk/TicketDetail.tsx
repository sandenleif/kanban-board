"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Trash2, MoveRight, Loader2, Lock, LockOpen,
  MessageSquare, Folder, Clock, User, Tag, Inbox,
  Phone, Mail, Building2, LayoutList, StickyNote,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, PriorityLabel, STATUS_CONFIG, PRIORITY_CONFIG, PRIORITY_DOT } from "./TicketBadges";
import {
  updateTicketAction, deleteTicketAction, addTicketCommentAction,
  convertTicketToTaskAction, lockTicketAction, unlockTicketAction,
} from "@/actions/ticket";
import { formatDate, getInitials, ticketAge } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { TicketStatus, TicketPriority } from "@prisma/client";

type Comment = {
  id: string; content: string; isInternal: boolean;
  createdAt: Date; author: { id: string; name: string };
};
type Ticket = {
  id: string; number: number; title: string; description: string | null;
  status: TicketStatus; priority: TicketPriority;
  locked: boolean; lockedAt: Date | null;
  topic: string | null; inventoryNumber: string | null;
  fromEmail: string | null; fromName: string | null;
  createdAt: Date; closedAt: Date | null; linkedTaskId: string | null;
  createdBy: { name: string };
  assignedTo: { id: string; name: string } | null;
  lockedBy: { id: string; name: string } | null;
  queue: { id: string; name: string } | null;
  team:  { id: string; name: string } | null;
  contact: { id: string; name: string; email: string | null; phone: string | null; company: string | null; department: string | null; source: string; notes: string | null } | null;
  comments: Comment[];
};
type Queue = { id: string; name: string };
type Team  = { id: string; name: string };
type OrgUser = { id: string; name: string };
type WorkspaceEntry = { id: string; name: string; projects: { id: string; name: string }[] };

interface Props {
  ticket: Ticket; queues: Queue[]; teams: Team[]; orgUsers: OrgUser[];
  allWorkspaces: WorkspaceEntry[]; currentUserId: string; isAdmin: boolean;
}

export function TicketDetail({ ticket, queues, teams, orgUsers, allWorkspaces, currentUserId, isAdmin }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConvert, setShowConvert] = useState(false);
  const [convertWs, setConvertWs] = useState("");
  const [convertProject, setConvertProject] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [commentState, commentAction, commentPending] = useActionState(addTicketCommentAction, {});

  const update = (data: Parameters<typeof updateTicketAction>[1]) => {
    startTransition(async () => {
      const r = await updateTicketAction(ticket.id, data);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  };

  const handleLock = () => {
    startTransition(async () => {
      const r = ticket.locked ? await unlockTicketAction(ticket.id) : await lockTicketAction(ticket.id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm("Ticket wirklich löschen?")) return;
    startTransition(async () => {
      await deleteTicketAction(ticket.id);
      router.push("/helpdesk");
    });
  };

  const handleConvert = () => {
    if (!convertProject) return;
    startTransition(async () => {
      const r = await convertTicketToTaskAction(ticket.id, convertProject);
      if (r.error) toast.error(r.error);
      else { toast.success("Als Task angelegt"); setShowConvert(false); router.refresh(); }
    });
  };

  const targetProjects = allWorkspaces.find((w) => w.id === convertWs)?.projects ?? [];
  const sender = ticket.fromName ?? ticket.fromEmail ?? ticket.createdBy.name;

  return (
    <div className="flex flex-col h-full -m-6">
      {/* OTOBO-style toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card text-sm flex-wrap shrink-0">
        <Link href="/helpdesk" className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Zurück
        </Link>
        <span className="text-border">|</span>
        <button type="button" onClick={handleLock} disabled={isPending}
          className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">
          {ticket.locked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {ticket.locked ? "Entsperren" : "Sperren"}
        </button>
        <span className="text-border">|</span>
        <button type="button" onClick={() => setShowConvert(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">
          <MoveRight className="h-3.5 w-3.5" /> Als Task anlegen
        </button>
        {["OPEN", "IN_PROGRESS"].includes(ticket.status) && (
          <>
            <span className="text-border">|</span>
            <button type="button" onClick={() => update({ status: "CLOSED" as TicketStatus })} disabled={isPending}
              className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">
              Schließen
            </button>
          </>
        )}
        {isAdmin && (
          <>
            <span className="text-border">|</span>
            <button type="button" onClick={handleDelete} disabled={isPending}
              className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-destructive/10 text-destructive transition-colors text-xs">
              <Trash2 className="h-3.5 w-3.5" /> Löschen
            </button>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: ticket + articles */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Ticket header */}
          <div className="flex items-start gap-3">
            <PRIORITY_DOT priority={ticket.priority} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-mono">
                Ticket #{String(ticket.number).padStart(4, "0")}
              </p>
              <h1 className="text-lg font-semibold text-foreground leading-tight mt-0.5">{ticket.title}</h1>
              {ticket.fromEmail && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Von: {ticket.fromName ? `${ticket.fromName} <${ticket.fromEmail}>` : ticket.fromEmail}
                </p>
              )}
            </div>
            <StatusBadge status={ticket.status} />
          </div>

          {/* Article overview */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" />
              Artikelübersicht — {ticket.comments.length + 1} Artikel
            </h2>

            {/* Original ticket as first article */}
            <div className="rounded-lg border border-border bg-card mb-3">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30 text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">1</span>
                <User className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{sender}</span>
                <span>via System</span>
                <span className="flex-1 truncate text-foreground">{ticket.title}</span>
                <span>{formatDate(ticket.createdAt)}</span>
              </div>
              <div className="px-4 py-3">
                {ticket.description ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic">Keine Beschreibung</p>
                )}
              </div>
            </div>

            {/* Comments as articles */}
            {ticket.comments.map((c, idx) => (
              <div key={c.id} className={cn("rounded-lg border mb-3", c.isInternal ? "border-yellow-400/30 bg-yellow-400/5" : "border-border bg-card")}>
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-muted/20 text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">{idx + 2}</span>
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[8px] bg-primary/20 text-primary">{getInitials(c.author.name)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-foreground">{c.author.name}</span>
                  <span>via OTOBO</span>
                  <span className="flex-1 truncate text-foreground">{ticket.title}</span>
                  <span>{formatDate(c.createdAt)}</span>
                  {c.isInternal && (
                    <span className="flex items-center gap-1 text-yellow-500 bg-yellow-400/10 rounded px-1.5 py-0.5">
                      <Lock className="h-2.5 w-2.5" /> Intern
                    </span>
                  )}
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{c.content}</p>
                </div>
              </div>
            ))}

            {/* Reply form */}
            <div className="rounded-lg border border-border bg-card">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Antworten
              </div>
              <div className="p-4">
                <form action={commentAction} className="space-y-3">
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="isInternal" value={String(isInternal)} />
                  <Textarea name="content" placeholder="Antwort eingeben…" rows={4} required
                    key={String(commentState.success)}
                    defaultValue={commentState.success ? "" : undefined} />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                      <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="accent-yellow-500" />
                      Intern (nicht für Kunden)
                    </label>
                    <Button type="submit" size="sm" disabled={commentPending}>
                      {commentPending && <Loader2 className="animate-spin h-3.5 w-3.5" />}
                      Senden
                    </Button>
                  </div>
                  {commentState.error && <p className="text-xs text-destructive">{commentState.error}</p>}
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Right: process info sidebar */}
        <div className="w-64 shrink-0 border-l border-border overflow-y-auto bg-muted/5">
          {/* Prozessinformationen header */}
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <h3 className="text-xs font-semibold text-foreground">Prozessinformationen</h3>
          </div>

          <div className="px-4 py-3 space-y-3 text-xs">
            <InfoRow label="Alter" value={ticketAge(ticket.createdAt)} icon={<Clock className="h-3 w-3" />} />
            <InfoRow label="Erstellt" value={formatDate(ticket.createdAt)} />
            <InfoRow label="Sperrung" value={ticket.locked ? `Gesperrt (${ticket.lockedBy?.name ?? "?"})` : "frei"}
              className={ticket.locked ? "text-yellow-400" : "text-green-400"} />

            {/* Status editable */}
            <div>
              <p className="text-muted-foreground mb-1 flex items-center gap-1"><Tag className="h-3 w-3" /> Status</p>
              <select aria-label="Status" className="w-full h-7 rounded border border-border bg-background text-xs px-2"
                value={ticket.status} onChange={(e) => update({ status: e.target.value as TicketStatus })} disabled={isPending}>
                {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>

            {/* Priority editable */}
            <div>
              <p className="text-muted-foreground mb-1">Priorität</p>
              <select aria-label="Priorität" className="w-full h-7 rounded border border-border bg-background text-xs px-2"
                value={ticket.priority} onChange={(e) => update({ priority: e.target.value as TicketPriority })} disabled={isPending}>
                {Object.entries(PRIORITY_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>

            {/* Queue editable */}
            {queues.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1">Queue</p>
                <select aria-label="Queue" className="w-full h-7 rounded border border-border bg-background text-xs px-2"
                  value={ticket.queue?.id ?? ""} onChange={(e) => update({ queueId: e.target.value || null })} disabled={isPending}>
                  <option value="">Keine Queue</option>
                  {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>
            )}

            {/* Team editable */}
            {teams.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1">Team</p>
                <select aria-label="Team" className="w-full h-7 rounded border border-border bg-background text-xs px-2"
                  value={ticket.team?.id ?? ""} onChange={(e) => update({ teamId: e.target.value || null })} disabled={isPending}>
                  <option value="">—</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            {/* Topic */}
            <div>
              <p className="text-muted-foreground mb-1">Thema</p>
              <input
                className="w-full h-7 rounded border border-border bg-background text-xs px-2 text-foreground"
                defaultValue={ticket.topic ?? ""}
                placeholder="Thema…"
                onBlur={(e) => { if (e.target.value !== (ticket.topic ?? "")) update({ topic: e.target.value || null }); }}
              />
            </div>

            {/* Inventory */}
            <div>
              <p className="text-muted-foreground mb-1">Inventarnummer</p>
              <input
                className="w-full h-7 rounded border border-border bg-background text-xs px-2 font-mono text-foreground"
                defaultValue={ticket.inventoryNumber ?? ""}
                placeholder="INV-…"
                onBlur={(e) => { if (e.target.value !== (ticket.inventoryNumber ?? "")) update({ inventoryNumber: e.target.value || null }); }}
              />
            </div>

            {/* Assignee editable */}
            <div>
              <p className="text-muted-foreground mb-1 flex items-center gap-1"><User className="h-3 w-3" /> Besitzer</p>
              <select aria-label="Besitzer" className="w-full h-7 rounded border border-border bg-background text-xs px-2"
                value={ticket.assignedTo?.id ?? ""} onChange={(e) => update({ assignedToId: e.target.value || null })} disabled={isPending}>
                <option value="">—</option>
                {orgUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            <div className="border-t border-border pt-2 space-y-1.5 text-muted-foreground">
              <InfoRow label="Erstellt von" value={ticket.createdBy.name} />
              {ticket.closedAt && <InfoRow label="Geschlossen" value={formatDate(ticket.closedAt)} />}
              {ticket.fromEmail && <InfoRow label="E-Mail" value={ticket.fromEmail} />}
              {ticket.linkedTaskId && (
                <p className="text-green-500 flex items-center gap-1"><MoveRight className="h-3 w-3" /> Als Task angelegt</p>
              )}
            </div>
          </div>

          {/* Kundeninformation */}
          {(ticket.contact || ticket.fromName || ticket.fromEmail) && (
            <>
              <div className="px-4 py-2.5 border-t border-b border-border bg-muted/30">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Kundeninformation
                  {ticket.contact?.source === "ad" && (
                    <span className="ml-auto text-[10px] text-primary bg-primary/10 rounded px-1.5 py-0.5 font-normal">AD</span>
                  )}
                </h3>
              </div>
              <div className="px-4 py-3 space-y-2 text-xs">
                {/* Name */}
                {(ticket.contact?.name ?? ticket.fromName) && (
                  <div className="flex items-start gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-foreground font-medium">{ticket.contact?.name ?? ticket.fromName}</span>
                  </div>
                )}
                {/* E-Mail */}
                {(ticket.contact?.email ?? ticket.fromEmail) && (
                  <div className="flex items-start gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <a href={`mailto:${ticket.contact?.email ?? ticket.fromEmail}`}
                      className="text-primary hover:underline break-all">
                      {ticket.contact?.email ?? ticket.fromEmail}
                    </a>
                  </div>
                )}
                {/* Telefon */}
                {ticket.contact?.phone && (
                  <div className="flex items-start gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <a href={`tel:${ticket.contact.phone}`} className="text-foreground hover:underline">
                      {ticket.contact.phone}
                    </a>
                  </div>
                )}
                {/* Firma */}
                {ticket.contact?.company && (
                  <div className="flex items-start gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-foreground">{ticket.contact.company}</span>
                  </div>
                )}
                {/* Abteilung */}
                {ticket.contact?.department && (
                  <div className="flex items-start gap-2">
                    <LayoutList className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-foreground">{ticket.contact.department}</span>
                  </div>
                )}
                {/* Notizen */}
                {ticket.contact?.notes && (
                  <div className="flex items-start gap-2">
                    <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{ticket.contact.notes}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Convert to task modal */}
      {showConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl p-5 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Ticket als Task anlegen</h3>
            </div>
            <select aria-label="Workspace wählen" className="w-full h-8 rounded-md border border-border bg-background text-sm px-2"
              value={convertWs} onChange={(e) => { setConvertWs(e.target.value); setConvertProject(""); }}>
              <option value="">Workspace wählen…</option>
              {allWorkspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {convertWs && (
              <select aria-label="Projekt wählen" className="w-full h-8 rounded-md border border-border bg-background text-sm px-2"
                value={convertProject} onChange={(e) => setConvertProject(e.target.value)}>
                <option value="">Projekt wählen…</option>
                {targetProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowConvert(false)}>Abbrechen</Button>
              <Button type="button" size="sm" onClick={handleConvert} disabled={!convertProject || isPending}>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Anlegen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, icon, className }: { label: string; value: string; icon?: React.ReactNode; className?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground flex items-center gap-1 shrink-0">{icon}{label}</span>
      <span className={cn("text-foreground text-right truncate", className)}>{value}</span>
    </div>
  );
}
