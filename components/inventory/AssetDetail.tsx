"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Trash2, UserPlus, User, Clock, Package, Loader2, Cpu, HardDrive, MemoryStick, Monitor, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateAssetAction, deleteAssetAction, assignAssetAction } from "@/actions/inventory";
import { toast } from "sonner";
import type { AssetStatus } from "@prisma/client";

type Assignment = { id: string; assignedAt: Date; returnedAt: Date | null; user: { id: string; name: string } };
type AgentHardware = {
  cpuName: string | null; cpuCores: number | null; ramGb: number | null; diskGb: number | null;
  osVersion: string | null; ipAddress: string | null; macAddress: string | null;
  domain: string | null; lastSeenAt: Date | null; hostname: string;
};
type Asset = {
  id: string; name: string; inventoryNumber: string | null; serialNumber: string | null;
  manufacturer: string | null; model: string | null; status: AssetStatus;
  purchaseDate: Date | null; warrantyUntil: Date | null; purchasePrice: unknown; notes: string | null;
  category:   { id: string; name: string } | null;
  location:   { id: string; name: string; building: string | null } | null;
  assignedTo: { id: string; name: string } | null;
  assignments: Assignment[];
  agent: AgentHardware | null;
};
type Category = { id: string; name: string };
type Location  = { id: string; name: string; building: string | null };
type OrgUser   = { id: string; name: string };

const STATUS_LABEL: Record<AssetStatus, string> = {
  ACTIVE: "Aktiv", MAINTENANCE: "Wartung", RETIRED: "Ausgemustert", LOST: "Verloren", RESERVED: "Reserviert",
};
const STATUS_COLOR: Record<AssetStatus, string> = {
  ACTIVE: "text-green-400 bg-green-400/10",
  MAINTENANCE: "text-yellow-400 bg-yellow-400/10",
  RETIRED: "text-muted-foreground bg-muted",
  LOST: "text-red-400 bg-red-400/10",
  RESERVED: "text-blue-400 bg-blue-400/10",
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-32">{label}</span>
      <span className="text-xs text-foreground text-right">{value ?? "—"}</span>
    </div>
  );
}

export function AssetDetail({ asset, categories, locations, orgUsers, isAdmin }: {
  asset: Asset; categories: Category[]; locations: Location[]; orgUsers: OrgUser[]; isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assignId, setAssignId] = useState(asset.assignedTo?.id ?? "");

  const update = (data: Parameters<typeof updateAssetAction>[1]) => {
    startTransition(async () => {
      const r = await updateAssetAction(asset.id, data);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm("Asset wirklich löschen?")) return;
    startTransition(async () => {
      const r = await deleteAssetAction(asset.id);
      if (r.error) toast.error(r.error);
      else router.push("/inventory");
    });
  };

  const handleAssign = () => {
    startTransition(async () => {
      const r = await assignAssetAction(asset.id, assignId || null);
      if (r.error) toast.error(r.error);
      else { toast.success("Zuweisung gespeichert"); router.refresh(); }
    });
  };

  const fmt = (d: Date | null) => d ? new Date(d).toLocaleDateString("de-DE") : null;
  const now = new Date();
  const warrantyExpired = asset.warrantyUntil && new Date(asset.warrantyUntil) < now;

  return (
    <div className="max-w-4xl mx-auto animate-in space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link href="/inventory" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Inventar
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-foreground">{asset.name}</h1>
            <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${STATUS_COLOR[asset.status]}`}>
              {STATUS_LABEL[asset.status]}
            </span>
          </div>
          {asset.inventoryNumber && (
            <p className="text-sm font-mono text-muted-foreground">{asset.inventoryNumber}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/inventory/${asset.id}/edit`}><Pencil className="h-3.5 w-3.5" /> Bearbeiten</Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Geräteinformationen
            </h2>
            <InfoRow label="Hersteller" value={asset.manufacturer} />
            <InfoRow label="Modell" value={asset.model} />
            <InfoRow label="Seriennummer" value={<span className="font-mono">{asset.serialNumber}</span>} />
            <InfoRow label="Kategorie" value={asset.category?.name} />
            <InfoRow label="Standort" value={asset.location ? (asset.location.building ? `${asset.location.building} – ${asset.location.name}` : asset.location.name) : null} />
            <InfoRow label="Kaufdatum" value={fmt(asset.purchaseDate)} />
            <InfoRow label="Garantie bis" value={
              asset.warrantyUntil
                ? <span className={warrantyExpired ? "text-red-400" : ""}>
                    {fmt(asset.warrantyUntil)}{warrantyExpired ? " (abgelaufen)" : ""}
                  </span>
                : null
            } />
            <InfoRow label="Kaufpreis" value={asset.purchasePrice ? `${Number(asset.purchasePrice).toFixed(2)} €` : null} />
          </div>

          {/* Hardware from agent */}
          {asset.agent && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary" /> Hardware
                </h2>
                {asset.agent.lastSeenAt && (
                  <span className="text-xs text-muted-foreground">
                    Letzter Kontakt: {new Date(asset.agent.lastSeenAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {asset.agent.osVersion && (
                  <div className="flex items-center gap-2 col-span-2">
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{asset.agent.osVersion}</span>
                  </div>
                )}
                {asset.agent.cpuName && (
                  <div className="flex items-center gap-2 col-span-2">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{asset.agent.cpuName}{asset.agent.cpuCores ? ` (${asset.agent.cpuCores} Kerne)` : ""}</span>
                  </div>
                )}
                {asset.agent.ramGb && (
                  <div className="flex items-center gap-2">
                    <MemoryStick className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{asset.agent.ramGb} GB RAM</span>
                  </div>
                )}
                {asset.agent.diskGb && (
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{asset.agent.diskGb} GB Disk</span>
                  </div>
                )}
                {asset.agent.ipAddress && (
                  <div className="flex items-center gap-2">
                    <Wifi className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-foreground">{asset.agent.ipAddress}</span>
                  </div>
                )}
                {asset.agent.macAddress && (
                  <div className="flex items-center gap-2">
                    <Wifi className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-foreground">{asset.agent.macAddress}</span>
                  </div>
                )}
                {asset.agent.domain && (
                  <div className="flex items-center gap-2 col-span-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{asset.agent.domain}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {asset.notes && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-2">Notizen</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{asset.notes}</p>
            </div>
          )}

          {/* Assignment history */}
          {asset.assignments.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Zuweisungshistorie
              </h2>
              <div className="space-y-2">
                {asset.assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-foreground font-medium">{a.user.name}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {fmt(a.assignedAt)} — {a.returnedAt ? fmt(a.returnedAt) : <span className="text-green-400">aktuell</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Current assignment */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" /> Zuweisung
            </h2>
            <div className="space-y-2">
              <select aria-label="Benutzer" className="w-full h-9 rounded-md border border-border bg-background text-sm px-3"
                value={assignId} onChange={(e) => setAssignId(e.target.value)}>
                <option value="">Nicht zugewiesen</option>
                {orgUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <Button size="sm" className="w-full" onClick={handleAssign} disabled={isPending}>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Zuweisung speichern
              </Button>
            </div>
          </div>

          {/* Status */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Status ändern</h2>
            <select aria-label="Status" className="w-full h-9 rounded-md border border-border bg-background text-sm px-3"
              value={asset.status} onChange={(e) => update({ status: e.target.value })} disabled={isPending}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
