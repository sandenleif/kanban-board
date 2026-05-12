"use client";

import { useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, MoveRight, Loader2, Lock, MessageSquare, Folder } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge, PriorityLabel, STATUS_CONFIG, PRIORITY_CONFIG } from "./TicketBadges";
import { updateTicketAction, deleteTicketAction, addTicketCommentAction, convertTicketToTaskAction } from "@/actions/ticket";
import { formatDate, getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { TicketStatus, TicketPriority } from "@prisma/client";

type Comment = { id: string; content: string; isInternal: boolean; createdAt: Date; author: { id: string; name: string } };
type Ticket = {
  id: string; number: number; title: string; description: string | null;
  status: TicketStatus; priority: TicketPriority;
  fromEmail: string | null; fromName: string | null;
  createdAt: Date; closedAt: Date | null; linkedTaskId: string | null;
  createdBy: { name: string }; assignedTo: { id: string; name: string } | null;
  queue: { id: string; name: string } | null;
  comments: Comment[];
};
type Queue = { id: string; name: string };
type OrgUser = { id: string; name: string };
type WorkspaceEntry = { id: string; name: string; projects: { id: string; name: string }[] };

interface Props {
  ticket: Ticket; queues: Queue[]; orgUsers: OrgUser[];
  allWorkspaces: WorkspaceEntry[]; currentUserId: string; isAdmin: boolean;
}

export function TicketDetail({ ticket, queues, orgUsers, allWorkspaces, currentUserId, isAdmin }: Props) {
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

  return (
    <div className="max-w-4xl mx-auto animate-in">
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-5">
        <Link href="/helpdesk" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Helpdesk
        </Link>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowConvert(true)}>
            <MoveRight className="h-3.5 w-3.5 mr-1" /> Als Task
          </Button>
          {isAdmin && (
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="text-xs text-muted-foreground font-mono mb-1">Ticket #{ticket.number}</p>
                <h1 className="text-xl font-semibold text-foreground">{ticket.title}</h1>
                {ticket.fromEmail && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Von: {ticket.fromName ?? ""} &lt;{ticket.fromEmail}&gt;
                  </p>
                )}
              </div>
              <StatusBadge status={ticket.status} />
            </div>
            {ticket.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">Keine Beschreibung</p>
            )}
          </div>

          {/* Comments */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Kommentare ({ticket.comments.length})
            </h2>

            {ticket.comments.map((c) => (
              <div key={c.id} className={cn("rounded-lg border p-4", c.isInternal && "border-yellow-400/20 bg-yellow-400/5")}>
                <div className="flex items-center gap-2 mb-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px] bg-primary/20 text-primary">{getInitials(c.author.name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-semibold">{c.author.name}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                  {c.isInternal && (
                    <span className="flex items-center gap-1 text-[10px] text-yellow-500 bg-yellow-400/10 rounded px-1.5 py-0.5 ml-auto">
                      <Lock className="h-2.5 w-2.5" /> Intern
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}

            {/* Add comment */}
            <form action={commentAction} className="space-y-2">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <input type="hidden" name="isInternal" value={String(isInternal)} />
              <Textarea name="content" placeholder="Kommentar hinzufügen…" rows={3} required
                defaultValue={commentState.success ? "" : undefined} key={String(commentState.success)} />
              <div className="flex items-center gap-3">
                <Button type="submit" size="sm" disabled={commentPending}>
                  {commentPending && <Loader2 className="animate-spin h-3.5 w-3.5" />}
                  Senden
                </Button>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="accent-yellow-500" />
                  Intern (nicht für Kunden sichtbar)
                </label>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Status</p>
              <select
                className="w-full h-8 rounded-md border border-border bg-background text-sm px-2"
                value={ticket.status}
                onChange={(e) => update({ status: e.target.value as TicketStatus })}
                disabled={isPending}
              >
                {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Priorität</p>
              <select
                className="w-full h-8 rounded-md border border-border bg-background text-sm px-2"
                value={ticket.priority}
                onChange={(e) => update({ priority: e.target.value as TicketPriority })}
                disabled={isPending}
              >
                {Object.entries(PRIORITY_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>

            {queues.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Queue</p>
                <select
                  className="w-full h-8 rounded-md border border-border bg-background text-sm px-2"
                  value={ticket.queue?.id ?? ""}
                  onChange={(e) => update({ queueId: e.target.value || null })}
                  disabled={isPending}
                >
                  <option value="">Keine Queue</option>
                  {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Zugewiesen an</p>
              <select
                className="w-full h-8 rounded-md border border-border bg-background text-sm px-2"
                value={ticket.assignedTo?.id ?? ""}
                onChange={(e) => update({ assignedToId: e.target.value || null })}
                disabled={isPending}
              >
                <option value="">Niemanden</option>
                {orgUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            <div className="pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
              <p>Erstellt von: <span className="text-foreground">{ticket.createdBy.name}</span></p>
              <p>Am: <span className="text-foreground">{formatDate(ticket.createdAt)}</span></p>
              {ticket.closedAt && <p>Geschlossen: <span className="text-foreground">{formatDate(ticket.closedAt)}</span></p>}
              {ticket.linkedTaskId && <p className="text-green-500">✓ Als Task angelegt</p>}
            </div>
          </div>
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
            <select className="w-full h-8 rounded-md border border-border bg-background text-sm px-2"
              value={convertWs} onChange={(e) => { setConvertWs(e.target.value); setConvertProject(""); }}>
              <option value="">Workspace wählen…</option>
              {allWorkspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {convertWs && (
              <select className="w-full h-8 rounded-md border border-border bg-background text-sm px-2"
                value={convertProject} onChange={(e) => setConvertProject(e.target.value)}>
                <option value="">Projekt wählen…</option>
                {targetProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowConvert(false)}>Abbrechen</Button>
              <Button size="sm" onClick={handleConvert} disabled={!convertProject || isPending}>Anlegen</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
