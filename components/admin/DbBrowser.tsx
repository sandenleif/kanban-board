"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Database, Table2, ChevronLeft, ChevronRight, Search, RefreshCw, X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DbUpdatePanel } from "./DbUpdatePanel";

type TableMeta = { name: string; count: number };
type ColumnInfo = { column_name: string; data_type: string; is_nullable: string };

interface Props {
  tables: TableMeta[];
  selectedTable: string | null;
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
}

function formatShort(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "object") {
    try { return JSON.stringify(val); } catch { return String(val); }
  }
  return String(val);
}

function CellModal({ value, column, onClose }: { value: unknown; column: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = value === null || value === undefined ? "NULL" : (
    typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
          <span className="text-sm font-semibold text-foreground font-mono">{column}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Kopieren">
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="p-4 max-h-[60vh] overflow-auto">
          <pre className={cn(
            "text-sm font-mono whitespace-pre-wrap break-all leading-relaxed",
            (value === null || value === undefined) ? "text-muted-foreground/50 italic" : "text-foreground"
          )}>
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function DbBrowser({ tables, selectedTable, columns, rows, totalRows, page, pageSize }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [activeCell, setActiveCell] = useState<{ value: unknown; column: string } | null>(null);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-[calc(100vh-56px-37px)] gap-0 -m-6 overflow-hidden">
      {/* Update panel — full width across top */}
      <div className="border-b border-border px-4 py-3 bg-background shrink-0">
        <DbUpdatePanel />
      </div>

      <div className="flex flex-1 overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-60 shrink-0 border-r border-border flex flex-col bg-sidebar overflow-hidden">
        <div className="px-3 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Datenbank</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Tabelle suchen..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-1">
          {filteredTables.map((t) => (
            <Link
              key={t.name}
              href={`/admin/db?table=${t.name}`}
              className={cn(
                "flex items-center justify-between px-3 py-1.5 text-xs transition-colors",
                selectedTable === t.name
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-1.5 truncate">
                <Table2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{t.name}</span>
              </span>
              <span className={cn(
                "text-[10px] rounded px-1 shrink-0",
                selectedTable === t.name ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {t.count.toLocaleString()}
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedTable ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3">
            <Database className="h-12 w-12 opacity-20" />
            <p className="text-sm">Tabelle aus der Liste wählen</p>
            <p className="text-xs opacity-60">
              {tables.length} Tabellen · {tables.reduce((s, t) => s + t.count, 0).toLocaleString()} Zeilen gesamt
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-muted/30">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">{selectedTable}</span>
                <span className="text-xs text-muted-foreground">
                  {totalRows.toLocaleString()} Zeilen · {columns.length} Spalten
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground opacity-60">Zelle anklicken = Vollinhalt</span>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => router.refresh()} title="Aktualisieren"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground">Seite {page}/{totalPages}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" asChild disabled={page <= 1}>
                  <Link href={`/admin/db?table=${selectedTable}&page=${page - 1}`}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" asChild disabled={page >= totalPages}>
                  <Link href={`/admin/db?table=${selectedTable}&page=${page + 1}`}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Column info bar */}
            <div className="flex gap-2 px-4 py-1.5 border-b border-border bg-muted/20 overflow-x-auto shrink-0">
              {columns.map((col) => (
                <span key={col.column_name} className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] font-mono font-semibold text-foreground">{col.column_name}</span>
                  <span className="text-[9px] text-muted-foreground bg-muted rounded px-1">{col.data_type}</span>
                  {col.is_nullable === "YES" && <span className="text-[9px] text-muted-foreground/60">?</span>}
                </span>
              ))}
            </div>

            {/* Data table */}
            <div className="flex-1 overflow-auto">
              {rows.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                  Keine Daten in dieser Tabelle
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                    <tr>
                      {columns.map((col) => (
                        <th
                          key={col.column_name}
                          className="text-left px-3 py-2 font-semibold text-muted-foreground border-b border-border whitespace-nowrap"
                        >
                          {col.column_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        {columns.map((col) => {
                          const val = row[col.column_name];
                          const raw = formatShort(val);
                          const isNull = val === null || val === undefined;
                          const isTruncated = raw.length > 80;

                          return (
                            <td
                              key={col.column_name}
                              className={cn(
                                "px-3 py-1.5 align-top max-w-[260px] cursor-pointer select-none",
                                "hover:bg-primary/5 transition-colors",
                                isNull && "text-muted-foreground/40 italic"
                              )}
                              onClick={() => setActiveCell({ value: val, column: col.column_name })}
                              title="Klicken für Vollinhalt"
                            >
                              <span className={cn(
                                "font-mono block truncate",
                                isTruncated && "text-primary/80"
                              )}>
                                {isTruncated ? raw.slice(0, 80) + " …" : raw}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
      </div>{/* end inner flex */}

      {/* Cell content modal */}
      {activeCell && (
        <CellModal
          value={activeCell.value}
          column={activeCell.column}
          onClose={() => setActiveCell(null)}
        />
      )}
    </div>
  );
}
