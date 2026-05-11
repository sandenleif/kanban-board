"use client";

import { useState, useRef } from "react";
import { Download, Upload, CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImportEvent } from "@/app/api/admin/db-import/route";

export function DbBackupPanel() {
  const [importing, setImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [importMsg, setImportMsg] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const handleExport = () => {
    window.location.href = "/api/admin/db-export";
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`Datenbank mit "${file.name}" überschreiben? Alle aktuellen Daten werden ersetzt!`)) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setImporting(true);
    setImportStatus("running");
    setImportLogs([]);
    setShowLogs(true);

    const fd = new FormData();
    fd.append("sql", file);

    const res = await fetch("/api/admin/db-import", { method: "POST", body: fd });
    if (!res.ok || !res.body) {
      setImportStatus("error");
      setImportMsg("Upload fehlgeschlagen");
      setImporting(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.replace(/^data: /, "").trim();
        if (!line) continue;
        try {
          const event: ImportEvent = JSON.parse(line);
          if (event.type === "log") {
            setImportLogs((p) => [...p, event.text]);
            setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 20);
          } else if (event.type === "done") {
            setImportStatus("done");
            setImportMsg(event.message);
          } else if (event.type === "error") {
            setImportStatus("error");
            setImportMsg(event.message);
          }
        } catch { /* ignore parse errors */ }
      }
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Backup / Restore</span>
          <span className="text-xs text-muted-foreground">Export als .sql · Import überschreibt alle Daten</span>
        </div>
        <div className="flex items-center gap-2">
          {importLogs.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowLogs((p) => !p)}>
              Log {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Exportieren
          </Button>
          <input ref={fileRef} type="file" accept=".sql" aria-label="SQL-Datei importieren" className="hidden" onChange={handleImport} />
          <Button
            size="sm" className="h-7 text-xs gap-1.5"
            variant={importStatus === "error" ? "destructive" : "default"}
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {importing ? "Importiert …" : "Importieren"}
          </Button>
        </div>
      </div>

      {importStatus !== "idle" && (
        <div className="px-4 py-2 bg-background flex items-center gap-2">
          {importStatus === "done" && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
          {importStatus === "error" && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
          {importStatus === "running" && <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />}
          <span className={cn("text-xs",
            importStatus === "done" && "text-green-500",
            importStatus === "error" && "text-destructive",
            importStatus === "running" && "text-muted-foreground"
          )}>
            {importStatus === "running" ? "Import läuft …" : importMsg}
          </span>
        </div>
      )}

      {showLogs && importLogs.length > 0 && (
        <div className="border-t border-border bg-black/60 max-h-40 overflow-y-auto px-4 py-2">
          {importLogs.map((line, i) => (
            <p key={i} className={cn("text-xs font-mono leading-5 whitespace-pre-wrap break-all",
              /error|fail/i.test(line) ? "text-red-400" : "text-muted-foreground"
            )}>{line}</p>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
