"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, X, Package, AlertTriangle, Wrench, Archive, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssetStatus } from "@prisma/client";

type Asset = {
  id: string; name: string; inventoryNumber: string | null; serialNumber: string | null;
  manufacturer: string | null; model: string | null; status: AssetStatus; createdAt: Date;
  warrantyUntil: Date | null;
  category:   { name: string } | null;
  location:   { name: string; building: string | null } | null;
  assignedTo: { id: string; name: string } | null;
};
type Category = { id: string; name: string };
type Location = { id: string; name: string; building: string | null };
type OrgUser  = { id: string; name: string };

const STATUS_LABEL: Record<AssetStatus, string> = {
  ACTIVE: "Aktiv", MAINTENANCE: "Wartung", RETIRED: "Ausgemustert", LOST: "Verloren", RESERVED: "Reserviert",
};
const STATUS_COLOR: Record<AssetStatus, string> = {
  ACTIVE: "text-green-400", MAINTENANCE: "text-yellow-400",
  RETIRED: "text-muted-foreground", LOST: "text-red-400", RESERVED: "text-blue-400",
};
const STATUS_ICON: Record<AssetStatus, React.ComponentType<{ className?: string }>> = {
  ACTIVE: Package, MAINTENANCE: Wrench, RETIRED: Archive, LOST: AlertTriangle, RESERVED: HelpCircle,
};

export function AssetList({ assets, categories, locations, isAdmin, currentFilters }: {
  assets: Asset[]; categories: Category[]; locations: Location[]; orgUsers: OrgUser[];
  isAdmin: boolean; currentFilters: { category?: string; status?: string; q?: string; location?: string };
}) {
  const router = useRouter();
  const [search, setSearch] = useState(currentFilters.q ?? "");
  const [visible, setVisible] = useState(10);
  const [, startTransition] = useTransition();

  const apply = (key: string, value: string) =>
    startTransition(() => {
      const p = new URLSearchParams();
      const carry = { category: currentFilters.category, status: currentFilters.status, q: currentFilters.q, location: currentFilters.location };
      Object.entries({ ...carry, [key]: value }).forEach(([k, v]) => { if (v) p.set(k, v); });
      router.push(`/inventory?${p}`);
    });

  const clearAll = () => { setSearch(""); startTransition(() => router.push("/inventory")); };
  const hasFilter = !!(currentFilters.category || currentFilters.status || currentFilters.q || currentFilters.location);

  const now = new Date();
  const soonMs = 90 * 24 * 60 * 60 * 1000;

  return (
    <div className="animate-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Inventar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{assets.length} Assets</p>
        </div>
        {isAdmin && (
          <Button asChild size="sm"><Link href="/inventory/new"><Plus className="h-4 w-4" /> Neues Asset</Link></Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {categories.length > 0 && (
          <select aria-label="Kategorie" className="h-8 rounded-md border border-border bg-background text-xs px-2"
            value={currentFilters.category ?? ""} onChange={(e) => apply("category", e.target.value)}>
            <option value="">Alle Kategorien</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {locations.length > 0 && (
          <select aria-label="Standort" className="h-8 rounded-md border border-border bg-background text-xs px-2"
            value={currentFilters.location ?? ""} onChange={(e) => apply("location", e.target.value)}>
            <option value="">Alle Standorte</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.building ? `${l.building} – ` : ""}{l.name}</option>)}
          </select>
        )}
        <select aria-label="Status" className="h-8 rounded-md border border-border bg-background text-xs px-2"
          value={currentFilters.status ?? ""} onChange={(e) => apply("status", e.target.value)}>
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex gap-1">
          <Input placeholder="Suchen…" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply("q", search)} className="h-8 w-40 text-xs" />
          <Button size="sm" className="h-8 w-8 p-0" onClick={() => apply("q", search)}><Search className="h-3.5 w-3.5" /></Button>
          {hasFilter && <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={clearAll}><X className="h-3.5 w-3.5" /></Button>}
        </div>
      </div>

      {/* Table */}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Package className="h-10 w-10 opacity-30" />
          <p className="text-sm">Keine Assets gefunden</p>
          {isAdmin && <Button size="sm" asChild><Link href="/inventory/new"><Plus className="h-4 w-4" /> Erstes Asset anlegen</Link></Button>}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr className="border-b border-border">
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Inventar-Nr.</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Kategorie</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Standort</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Zugewiesen an</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Garantie</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.slice(0, visible).map((a) => {
                const Icon = STATUS_ICON[a.status];
                const warrantyExpired = a.warrantyUntil && new Date(a.warrantyUntil) < now;
                const warrantySoon = a.warrantyUntil && !warrantyExpired && new Date(a.warrantyUntil).getTime() - now.getTime() < soonMs;
                return (
                  <tr key={a.id} className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => router.push(`/inventory/${a.id}`)}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-foreground">{a.name}</p>
                      {a.model && <p className="text-muted-foreground">{a.manufacturer} {a.model}</p>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground hidden sm:table-cell">
                      {a.inventoryNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">
                      {a.category?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell">
                      {a.location ? (a.location.building ? `${a.location.building} – ${a.location.name}` : a.location.name) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden xl:table-cell">
                      {a.assignedTo?.name ?? <span className="text-muted-foreground/40">Nicht zugewiesen</span>}
                    </td>
                    <td className="px-3 py-2.5 hidden xl:table-cell">
                      {a.warrantyUntil ? (
                        <span className={warrantyExpired ? "text-red-400" : warrantySoon ? "text-yellow-400" : "text-muted-foreground"}>
                          {new Date(a.warrantyUntil).toLocaleDateString("de-DE")}
                          {warrantyExpired && " (abgelaufen)"}
                          {warrantySoon && " (bald)"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`flex items-center gap-1 ${STATUS_COLOR[a.status]}`}>
                        <Icon className="h-3 w-3" />{STATUS_LABEL[a.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {assets.length > 10 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              <span>{Math.min(visible, assets.length)} von {assets.length}</span>
              <div className="flex gap-3">
                {visible < assets.length && (
                  <button onClick={() => setVisible((v) => Math.min(v + 10, assets.length))}
                    className="flex items-center gap-1 hover:text-foreground transition-colors">
                    <ChevronDown className="h-3.5 w-3.5" /> {Math.min(10, assets.length - visible)} weitere
                  </button>
                )}
                {visible < assets.length && (
                  <button onClick={() => setVisible(assets.length)}
                    className="hover:text-foreground transition-colors">Alle anzeigen</button>
                )}
                {visible > 10 && (
                  <button onClick={() => setVisible(10)}
                    className="flex items-center gap-1 hover:text-foreground transition-colors">
                    <ChevronUp className="h-3.5 w-3.5" /> Ausblenden
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
