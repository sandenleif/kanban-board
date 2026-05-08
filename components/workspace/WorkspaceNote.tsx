"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { FileText, Save } from "lucide-react";
import { upsertWorkspaceNoteAction } from "@/actions/notes";

interface Props {
  workspaceId: string;
  initialContent: string | null;
  canEdit: boolean;
}

export function WorkspaceNote({ workspaceId, initialContent, canEdit }: Props) {
  const [content, setContent] = useState(initialContent ?? "");
  const [saved, setSaved] = useState(true);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save with debounce
  useEffect(() => {
    if (!canEdit) return;
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        await upsertWorkspaceNoteAction(workspaceId, content);
        setSaved(true);
      });
    }, 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [content, canEdit, workspaceId]);

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notizen</span>
        </div>
        {canEdit && (
          <span className={`text-xs transition-opacity ${saved && !isPending ? "opacity-0" : "opacity-60"}`}>
            <Save className="h-3 w-3 inline mr-0.5" />
            {isPending ? "Speichert..." : "Ungespeichert"}
          </span>
        )}
      </div>

      <textarea
        className="flex-1 w-full resize-none bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none font-mono leading-relaxed"
        placeholder={canEdit ? "Freies Textfeld – Notizen, Links, Ideen..." : "Keine Notizen vorhanden."}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        readOnly={!canEdit}
      />
    </div>
  );
}
