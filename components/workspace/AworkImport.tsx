"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Preview = { count: number; sample: { title: string; list: string | null; assignees: string[]; statusType: string; statusName: string }[] };

export function AworkImport({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ created: number; total: number; errors: string[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  const STATUS_LABELS: Record<string, string> = {
    todo: "To Do", progress: "In Arbeit", done: "Erledigt", stuck: "Wartet/Blocked",
  };

  const handleFile = async (f: File) => {
    setFile(f); setPreview(null); setResult(null);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("preview", "true");
    try {
      const res = await fetch("/api/import/awork", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) { toast.error(data.error); return; }
      setPreview(data);
    } catch {
      toast.error("Datei konnte nicht gelesen werden");
    }
  };

  const handleImport = () => {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", projectId);
      try {
        const res = await fetch("/api/import/awork", { method: "POST", body: fd });
        const data = await res.json();
        if (data.error) { toast.error(data.error); return; }
        setResult(data);
        if (data.created > 0) {
          toast.success(`${data.created} Tasks importiert`);
          router.refresh();
        }
      } catch {
        toast.error("Import fehlgeschlagen");
      }
    });
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); if (fileRef.current) fileRef.current.value = ""; };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {!file && (
        <div
          className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground">Awork XLSX hier ablegen</p>
          <p className="text-sm text-muted-foreground mt-1">oder klicken zum Auswählen</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {/* File selected + preview */}
      {file && !result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">{file.name}</span>
              {preview && <span className="text-xs text-muted-foreground">({preview.count} Tasks erkannt)</span>}
            </div>
            <button type="button" onClick={reset} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {preview && (
            <>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/30 px-4 py-2 border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vorschau (erste 5)</p>
                </div>
                <table className="w-full text-xs">
                  <thead className="border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Name</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium hidden md:table-cell">Liste</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium hidden sm:table-cell">Zugewiesen</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.sample.map((row, i) => (
                      <tr key={i} className="hover:bg-muted/10">
                        <td className="px-3 py-2 font-medium text-foreground max-w-[200px] truncate">{row.title}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell max-w-[160px] truncate">{row.list ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{row.assignees.join(", ") || "—"}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                            {STATUS_LABELS[row.statusType] ?? row.statusType}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleImport} disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {preview.count} Tasks importieren
                </Button>
                <Button variant="ghost" onClick={reset}>Abbrechen</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 ${result.created > 0 ? "border-green-400/20 bg-green-400/5 text-green-400" : "border-border text-muted-foreground"}`}>
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{result.created} von {result.total} Tasks erfolgreich importiert</span>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/5 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Hinweise</p>
              {result.errors.map((e, i) => <p key={i} className="text-xs text-muted-foreground">{e}</p>)}
            </div>
          )}
          <Button variant="outline" onClick={reset}>Weitere Datei importieren</Button>
        </div>
      )}
    </div>
  );
}
