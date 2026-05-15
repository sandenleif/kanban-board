"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAssetAction } from "@/actions/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Loader2 } from "lucide-react";

type Category = { id: string; name: string };
type Location  = { id: string; name: string; building: string | null };
type OrgUser   = { id: string; name: string };

const STATUSES = [
  { value: "ACTIVE", label: "Aktiv" },
  { value: "MAINTENANCE", label: "Wartung" },
  { value: "RESERVED", label: "Reserviert" },
  { value: "RETIRED", label: "Ausgemustert" },
  { value: "LOST", label: "Verloren" },
];

export function AssetForm({ categories, locations, orgUsers, asset }: {
  categories: Category[]; locations: Location[]; orgUsers: OrgUser[];
  asset?: { id: string; name: string; inventoryNumber: string | null; serialNumber: string | null;
    manufacturer: string | null; model: string | null; status: string;
    categoryId: string | null; locationId: string | null; assignedToId: string | null;
    purchaseDate: Date | null; warrantyUntil: Date | null; purchasePrice: unknown; notes: string | null };
}) {
  const router = useRouter();
  const [state, action, isPending] = useActionState(createAssetAction, {});

  useEffect(() => {
    if (state.success && state.id) router.push(`/inventory/${state.id}`);
  }, [state.success, state.id, router]);

  const fmt = (d: Date | null) => d ? new Date(d).toISOString().split("T")[0] : "";

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-card p-6">
      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />{state.error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="name">Name / Bezeichnung *</Label>
          <Input id="name" name="name" defaultValue={asset?.name} placeholder="z.B. Dell Latitude 5420" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inventoryNumber">Inventarnummer</Label>
          <Input id="inventoryNumber" name="inventoryNumber" defaultValue={asset?.inventoryNumber ?? ""} placeholder="INV-2024-0001" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="serialNumber">Seriennummer</Label>
          <Input id="serialNumber" name="serialNumber" defaultValue={asset?.serialNumber ?? ""} placeholder="SN-XXXXX" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manufacturer">Hersteller</Label>
          <Input id="manufacturer" name="manufacturer" defaultValue={asset?.manufacturer ?? ""} placeholder="Dell, HP, Apple…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="model">Modell</Label>
          <Input id="model" name="model" defaultValue={asset?.model ?? ""} placeholder="Latitude 5420" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Kategorie</Label>
          <select id="categoryId" name="categoryId" defaultValue={asset?.categoryId ?? ""}
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
            <option value="">Keine Kategorie</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="locationId">Standort</Label>
          <select id="locationId" name="locationId" defaultValue={asset?.locationId ?? ""}
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
            <option value="">Kein Standort</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.building ? `${l.building} – ` : ""}{l.name}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="assignedToId">Zugewiesen an</Label>
          <select id="assignedToId" name="assignedToId" defaultValue={asset?.assignedToId ?? ""}
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
            <option value="">Nicht zugewiesen</option>
            {orgUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={asset?.status ?? "ACTIVE"}
            className="w-full h-9 rounded-md border border-border bg-background text-sm px-3">
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="purchaseDate">Kaufdatum</Label>
          <Input id="purchaseDate" name="purchaseDate" type="date" defaultValue={fmt(asset?.purchaseDate ?? null)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="warrantyUntil">Garantie bis</Label>
          <Input id="warrantyUntil" name="warrantyUntil" type="date" defaultValue={fmt(asset?.warrantyUntil ?? null)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="purchasePrice">Kaufpreis (€)</Label>
          <Input id="purchasePrice" name="purchasePrice" type="number" step="0.01" min="0"
            defaultValue={asset?.purchasePrice ? String(asset.purchasePrice) : ""} placeholder="0.00" />
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="notes">Notizen</Label>
          <Textarea id="notes" name="notes" defaultValue={asset?.notes ?? ""} rows={3} placeholder="Weitere Informationen…" />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin h-4 w-4" />}
          {asset ? "Speichern" : "Asset anlegen"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Abbrechen</Button>
      </div>
    </form>
  );
}
