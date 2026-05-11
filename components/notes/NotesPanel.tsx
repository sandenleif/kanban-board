"use client";

import { useState, useTransition } from "react";
import {
  Plus, Trash2, Edit2, Check, X, MoveRight,
  ArrowDown, ArrowUp, Minus, AlertTriangle,
  ChevronDown, StickyNote, Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { NotePriority } from "@prisma/client";

export type NoteItem = {
  id: string;
  title: string;
  content: string | null;
  priority: NotePriority;
  position: number;
};

type Project = { id: string; name: string };
type WorkspaceEntry = { id: string; name: string; projects: Project[] };

interface Props {
  notes: NoteItem[];
  canEdit: boolean;
  allWorkspaces?: WorkspaceEntry[]; // for "convert to task"
  onCreateNote: (title: string, priority: NotePriority) => Promise<{ id?: string; error?: string }>;
  onUpdateNote: (id: string, data: { title?: string; content?: string; priority?: NotePriority }) => Promise<{ error?: string }>;
  onDeleteNote: (id: string) => Promise<{ error?: string }>;
  onConvertToTask?: (noteId: string, projectId: string) => Promise<{ error?: string }>;
}

const PRIORITIES: { value: NotePriority; label: string; icon: React.ReactNode; cls: string; bg: string }[] = [
  { value: "LOW",    label: "Niedrig",  icon: <ArrowDown className="h-3 w-3" />,      cls: "text-blue-400",   bg: "bg-blue-400/10" },
  { value: "MEDIUM", label: "Mittel",   icon: <Minus className="h-3 w-3" />,          cls: "text-yellow-400", bg: "bg-yellow-400/10" },
  { value: "HIGH",   label: "Hoch",     icon: <ArrowUp className="h-3 w-3" />,        cls: "text-orange-400", bg: "bg-orange-400/10" },
  { value: "URGENT", label: "Dringend", icon: <AlertTriangle className="h-3 w-3" />,  cls: "text-red-400",    bg: "bg-red-400/10" },
];

function PriorityBadge({ priority }: { priority: NotePriority }) {
  const p = PRIORITIES.find((x) => x.value === priority)!;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", p.cls, p.bg)}>
      {p.icon} {p.label}
    </span>
  );
}

function NoteCard({
  note, compact, canEdit, allWorkspaces = [],
  onUpdate, onDelete, onConvert,
}: {
  note: NoteItem;
  compact: boolean;
  canEdit: boolean;
  allWorkspaces?: WorkspaceEntry[];
  onUpdate: (data: { title?: string; content?: string; priority?: NotePriority }) => void;
  onDelete: () => void;
  onConvert?: (projectId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editContent, setEditContent] = useState(note.content ?? "");
  const [editPriority, setEditPriority] = useState<NotePriority>(note.priority);
  const [showConvert, setShowConvert] = useState(false);
  const [convertWs, setConvertWs] = useState("");
  const [convertProject, setConvertProject] = useState("");

  const saveEdit = () => {
    onUpdate({ title: editTitle, content: editContent, priority: editPriority });
    setEditing(false);
  };

  const targetProjects = allWorkspaces.find((w) => w.id === convertWs)?.projects ?? [];

  if (editing) {
    return (
      <div className="border border-primary/40 rounded-lg p-3 space-y-2 bg-card">
        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-7 text-sm font-medium" autoFocus />
        <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder="Inhalt…" className="min-h-[80px] text-xs resize-none" />
        <div className="flex gap-1 flex-wrap">
          {PRIORITIES.map((p) => (
            <button key={p.value} type="button" onClick={() => setEditPriority(p.value)}
              className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border transition-colors",
                editPriority === p.value ? cn(p.cls, p.bg, "border-current") : "border-border text-muted-foreground")}>
              {p.icon}{p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button size="sm" className="h-6 text-xs" onClick={saveEdit}><Check className="h-3 w-3 mr-1" />Speichern</Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditing(false)}>Abbrechen</Button>
        </div>
      </div>
    );
  }

  if (compact && !expanded) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 cursor-pointer hover:bg-accent transition-colors group"
        onClick={() => setExpanded(true)}
      >
        <PriorityBadge priority={note.priority} />
        <span className="flex-1 text-xs font-medium text-foreground truncate">{note.title}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/50 shrink-0" />
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg bg-card transition-shadow", compact && "shadow-md")}>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <PriorityBadge priority={note.priority} />
              {compact && (
                <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setExpanded(false)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug">{note.title}</p>
          </div>
          {canEdit && !compact && (
            <div className="flex gap-0.5 shrink-0">
              {onConvert && <Button size="icon" variant="ghost" className="h-6 w-6" title="Als Task anlegen" onClick={() => setShowConvert(true)}><MoveRight className="h-3 w-3" /></Button>}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}><Edit2 className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
            </div>
          )}
        </div>

        {note.content ? (
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{note.content}</p>
        ) : (
          canEdit && <p className="text-xs text-muted-foreground/40 italic">Kein Inhalt – klicke Bearbeiten zum Hinzufügen</p>
        )}

        {canEdit && compact && (
          <div className="flex gap-1 pt-1 border-t border-border">
            {onConvert && <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => setShowConvert(true)}><MoveRight className="h-3 w-3" />Task</Button>}
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => { setEditing(true); setExpanded(false); }}><Edit2 className="h-3 w-3" />Edit</Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" />Löschen</Button>
          </div>
        )}
      </div>

      {/* Convert to task dialog */}
      {showConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl p-5 w-full max-w-sm shadow-xl space-y-3">
            <div className="flex items-center gap-2">
              <Folder className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Als Task anlegen</h3>
            </div>
            {allWorkspaces.length > 0 ? (
              <>
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
              </>
            ) : <p className="text-xs text-muted-foreground">Du bist in keinem Workspace mit Projekten.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowConvert(false)}>Abbrechen</Button>
              <Button size="sm" onClick={() => { if (convertProject && onConvert) { onConvert(convertProject); setShowConvert(false); } }} disabled={!convertProject}>Anlegen</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "position", label: "Reihenfolge" },
  { value: "priority-desc", label: "Priorität ↓" },
  { value: "priority-asc", label: "Priorität ↑" },
  { value: "title", label: "Name" },
] as const;

const PRIORITY_ORDER: Record<NotePriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function NotesPanel({ notes: initial, canEdit, allWorkspaces = [], onCreateNote, onUpdateNote, onDeleteNote, onConvertToTask }: Props) {
  const [notes, setNotes] = useState<NoteItem[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [sort, setSort] = useState<typeof SORT_OPTIONS[number]["value"]>("position");
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<NotePriority>("MEDIUM");

  const COMPACT_THRESHOLD = 4;
  const compact = notes.length > COMPACT_THRESHOLD;

  const sorted = [...notes].sort((a, b) => {
    if (sort === "priority-desc") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (sort === "priority-asc") return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    if (sort === "title") return a.title.localeCompare(b.title);
    return a.position - b.position;
  });

  const addNote = () => {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      const res = await onCreateNote(newTitle.trim(), newPriority);
      if (res.id) {
        setNotes((p) => [...p, { id: res.id!, title: newTitle.trim(), content: null, priority: newPriority, position: p.length }]);
        setNewTitle("");
        setNewPriority("MEDIUM");
        setShowAdd(false);
      }
    });
  };

  const updateNote = (id: string, data: { title?: string; content?: string; priority?: NotePriority }) => {
    startTransition(async () => {
      await onUpdateNote(id, data);
      setNotes((p) => p.map((n) => n.id === id ? { ...n, ...data } : n));
    });
  };

  const deleteNote = (id: string) => {
    startTransition(async () => {
      await onDeleteNote(id);
      setNotes((p) => p.filter((n) => n.id !== id));
    });
  };

  const convertToTask = (noteId: string, projectId: string) => {
    startTransition(async () => {
      await onConvertToTask?.(noteId, projectId);
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Notizen <span className="normal-case font-normal">({notes.length}/20)</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            className="h-6 rounded border border-border bg-background text-xs px-1.5 text-muted-foreground"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {canEdit && notes.length < 20 && (
            <Button size="sm" className="h-6 text-xs gap-1" onClick={() => setShowAdd(true)} disabled={isPending}>
              <Plus className="h-3 w-3" /> Notiz
            </Button>
          )}
        </div>
      </div>

      {/* Add form */}
      {showAdd && canEdit && (
        <div className="border border-primary/40 rounded-lg p-3 space-y-2 mb-3 bg-card shrink-0">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Titel…" className="h-7 text-sm" autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") addNote(); if (e.key === "Escape") setShowAdd(false); }} />
          <div className="flex gap-1 flex-wrap">
            {PRIORITIES.map((p) => (
              <button key={p.value} type="button" onClick={() => setNewPriority(p.value)}
                className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border transition-colors",
                  newPriority === p.value ? cn(p.cls, p.bg, "border-current") : "border-border text-muted-foreground")}>
                {p.icon}{p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-xs" onClick={addNote} disabled={!newTitle.trim() || isPending}><Check className="h-3 w-3 mr-1" />Hinzufügen</Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowAdd(false)}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {sorted.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            Noch keine Notizen.{canEdit && " Klicke \"+ Notiz\" zum Erstellen."}
          </p>
        )}
        {sorted.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            compact={compact}
            canEdit={canEdit}
            allWorkspaces={allWorkspaces}
            onUpdate={(data) => updateNote(note.id, data)}
            onDelete={() => deleteNote(note.id)}
            onConvert={onConvertToTask ? (pid) => convertToTask(note.id, pid) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
