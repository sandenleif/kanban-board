"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { addPortalCommentAction, portalLogoutAction } from "@/actions/portal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, LogOut, Clock, MessageSquare, User, Loader2, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { ticketAge } from "@/lib/utils";
import type { TicketStatus, TicketPriority } from "@prisma/client";
import type { PortalSession } from "@/lib/portal-auth";

type Comment = {
  id: string; content: string; isInternal: boolean;
  createdAt: Date; author: { id: string; name: string };
};
type Ticket = {
  id: string; number: number; title: string; description: string | null;
  status: TicketStatus; priority: TicketPriority; createdAt: Date;
  category: { name: string } | null;
  queue: { name: string } | null;
  assignedTo: { name: string } | null;
  comments: Comment[];
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Offen", IN_PROGRESS: "In Bearbeitung", PENDING: "Ausstehend",
  RESOLVED: "Gelöst", CLOSED: "Geschlossen",
};
const STATUS_COLOR: Record<string, string> = {
  OPEN: "text-blue-400 bg-blue-400/10",
  IN_PROGRESS: "text-yellow-400 bg-yellow-400/10",
  PENDING: "text-orange-400 bg-orange-400/10",
  RESOLVED: "text-green-400 bg-green-400/10",
  CLOSED: "text-muted-foreground bg-muted",
};

export function PortalTicketDetail({ ticket, session, orgSlug, orgName, logoSrc }: {
  ticket: Ticket;
  session: PortalSession;
  orgSlug: string;
  orgName: string;
  logoSrc: string | null;
}) {
  const [state, action, isPending] = useActionState(addPortalCommentAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  const isClosed = ticket.status === "CLOSED" || ticket.status === "RESOLVED";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoSrc
            ? <img src={logoSrc} alt={orgName} className="h-8 object-contain" />
            : <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
                  <rect x="1" y="1" width="5" height="14" rx="1" fill="currentColor" />
                  <rect x="8" y="1" width="5" height="9" rx="1" fill="currentColor" opacity="0.7" />
                </svg>
              </div>
          }
          <div>
            <p className="font-semibold text-sm text-foreground">{orgName}</p>
            <p className="text-xs text-muted-foreground">Kundenportal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{session.name}</span>
          <form action={() => portalLogoutAction(orgSlug)}>
            <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
              <LogOut className="h-4 w-4" /> Abmelden
            </Button>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Back link */}
        <Link href={`/portal/${orgSlug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Alle Tickets
        </Link>

        {/* Ticket header */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">#{String(ticket.number).padStart(4, "0")}</span>
                {ticket.category && (
                  <span className="bg-muted rounded px-1.5 py-0.5">{ticket.category.name}</span>
                )}
              </div>
              <h1 className="text-lg font-semibold text-foreground">{ticket.title}</h1>
            </div>
            <span className={`shrink-0 text-xs font-medium rounded-full px-2.5 py-1 ${STATUS_COLOR[ticket.status]}`}>
              {STATUS_LABEL[ticket.status] ?? ticket.status}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{ticketAge(ticket.createdAt)}</span>
            {ticket.assignedTo && (
              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />Bearbeiter: {ticket.assignedTo.name}</span>
            )}
            {ticket.queue && <span>{ticket.queue.name}</span>}
          </div>

          {ticket.description && (
            <div className="pt-2 border-t border-border">
              <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Verlauf ({ticket.comments.length})
          </h2>

          {ticket.comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6 rounded-xl border border-dashed border-border">
              Noch keine Antworten — wir melden uns bald bei Ihnen.
            </p>
          )}

          {ticket.comments.map((c) => {
            const isCustomer = c.author.name === session.name || !c.author.name;
            return (
              <div key={c.id} className={`rounded-xl border p-4 space-y-1.5 ${
                isCustomer
                  ? "border-primary/20 bg-primary/5 ml-6"
                  : "border-border bg-card mr-6"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    {isCustomer ? "Sie" : c.author.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
              </div>
            );
          })}
        </div>

        {/* Reply form */}
        {!isClosed ? (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Antwort schreiben</h3>
            <form ref={formRef} action={action} className="space-y-3">
              <input type="hidden" name="ticketId" value={ticket.id} />
              {state.error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />{state.error}
                </div>
              )}
              {state.success && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" />Nachricht gesendet
                </div>
              )}
              <Textarea
                name="content"
                placeholder="Ihre Nachricht an den IT-Support…"
                rows={4}
                required
              />
              <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Senden
              </Button>
            </form>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            Dieses Ticket ist {STATUS_LABEL[ticket.status].toLowerCase()} — keine weiteren Nachrichten möglich.
          </div>
        )}
      </main>
    </div>
  );
}
