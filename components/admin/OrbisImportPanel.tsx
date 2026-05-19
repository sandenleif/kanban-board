"use client";

import { useRef, useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Result = { imported: number; updated: number; skipped: number };

function parseOrbisCSV(text: string) {
  // Detect separator: ; is standard for German CSV exports
  const sep = text.includes(";") ? ";" : ",";

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header to find column indices flexibly
  const header = lines[0].split(sep).map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());

  const idx = {
    kuerzel:     header.findIndex((h) => h.includes("kürzel") || h.includes("kurzel") || h === "a"),
    rolle:       header.findIndex((h) => h === "status" || h.includes("rolle")),
    vorname:     header.findIndex((h) => h === "vorname"),
    nachname:    header.findIndex((h) => h === "nachname"),
    gueltigBis:  header.findIndex((h) => h.includes("gültig bis") || h.includes("gultig bis")),
    ungueltig:   header.findIndex((h) => h === "g"),
    gesperrt:    header.findIndex((h) => h === "s"),
    einrichtung: header.findIndex((h) => h.includes("einrichtung")),
  };

  // Fallback to positional if headers not found
  if (idx.kuerzel    === -1) idx.kuerzel    = 0;
  if (idx.rolle      === -1) idx.rolle      = 1;
  if (idx.vorname    === -1) idx.vorname    = 2;
  if (idx.nachname   === -1) idx.nachname   = 3;
  if (idx.gueltigBis === -1) idx.gueltigBis = 5;
  if (idx.ungueltig  === -1) idx.ungueltig  = 6;
  if (idx.gesperrt   === -1) idx.gesperrt   = 7;
  if (idx.einrichtung === -1) idx.einrichtung = 8;

  const seen = new Set<string>();
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.replace(/^["']|["']$/g, "").trim());
    if (cols.length < 4) continue;

    const ungueltig = (cols[idx.ungueltig] ?? "").toLowerCase();
    const gesperrt  = (cols[idx.gesperrt]  ?? "").toLowerCase();

    // Skip invalid or locked users
    if (ungueltig.includes("ungültig") || ungueltig.includes("ungultig")) continue;
    if (gesperrt.includes("gesperrt"))  continue;

    const kuerzel = cols[idx.kuerzel]?.toUpperCase();
    if (!kuerzel) continue;
    // Deduplicate by Kürzel
    if (seen.has(kuerzel)) continue;
    seen.add(kuerzel);

    rows.push({
      kuerzel,
      vorname:     cols[idx.vorname]    ?? "",
      nachname:    cols[idx.nachname]   ?? "",
      rolle:       cols[idx.rolle]      ?? "",
      einrichtung: cols[idx.einrichtung] ?? "",
    });
  }

  return rows;
}

export function OrbisImportPanel() {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [loading, setLoading]   = useState(false);
  const [preview, setPreview]   = useState<{ rows: number; sample: string[] } | null>(null);
  const [result,  setResult]    = useState<Result | null>(null);
  const [error,   setError]     = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ReturnType<typeof parseOrbisCSV>>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseOrbisCSV(text);
      setParsedRows(rows);
      setPreview({
        rows: rows.length,
        sample: rows.slice(0, 3).map((r) => `${r.kuerzel} – ${r.vorname} ${r.nachname}`),
      });
    };
    reader.readAsText(file, "windows-1252"); // Orbis exports typically use Windows encoding
  };

  const handleImport = async () => {
    if (!parsedRows.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orbis-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedRows),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Import fehlgeschlagen"); return; }
      setResult(data);
      setPreview(null);
      setParsedRows([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 mt-6">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Orbis User Import</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Importiert aktive Benutzer aus einem Orbis-CSV-Export als Ticket-Kunden.
        Gesperrte und ungültige Benutzer werden automatisch übersprungen.
      </p>

      <div className="flex items-center gap-3">
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={loading}>
          <Upload className="h-3.5 w-3.5" /> CSV-Datei auswählen
        </Button>
        {preview && (
          <span className="text-xs text-muted-foreground">{preview.rows} gültige Benutzer gefunden</span>
        )}
      </div>

      {preview && (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-foreground">Vorschau (erste 3):</p>
          {preview.sample.map((s, i) => (
            <p key={i} className="text-xs text-muted-foreground font-mono">{s}</p>
          ))}
          {preview.rows > 3 && (
            <p className="text-xs text-muted-foreground">… und {preview.rows - 3} weitere</p>
          )}
          <Button size="sm" onClick={handleImport} disabled={loading} className="mt-2">
            {loading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importiere…</>
              : <><Upload className="h-3.5 w-3.5" /> {preview.rows} Benutzer importieren</>}
          </Button>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-2 rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Import abgeschlossen: <strong>{result.imported}</strong> neu angelegt,{" "}
            <strong>{result.updated}</strong> aktualisiert,{" "}
            <strong>{result.skipped}</strong> übersprungen.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
