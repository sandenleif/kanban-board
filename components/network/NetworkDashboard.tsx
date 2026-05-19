"use client";

import { useState, useTransition, useMemo } from "react";
import { Network, Plus, Trash2, Loader2, AlertTriangle, Wifi, WifiOff, RefreshCw, ChevronDown, ChevronUp, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Vlan = { id: string; name: string; subnet: string; gateway: string | null; description: string | null };
type Agent = { hostname: string; ipAddress: string | null; osVersion: string | null; lastSeenAt: Date | null; manufacturer: string | null; model: string | null };
type AdComputer = { hostname: string; os: string; lastLogon: string; ipAddress?: string };

// ── IP subnet helpers ─────────────────────────────────────────────────────────

function ipToNum(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) | parseInt(oct), 0) >>> 0;
}

function ipInSubnet(ip: string, cidr: string): boolean {
  try {
    const [subnetIp, prefix] = cidr.split("/");
    const mask = prefix === "32" ? 0xffffffff : (~(2 ** (32 - parseInt(prefix)) - 1)) >>> 0;
    return (ipToNum(ip) & mask) === (ipToNum(subnetIp) & mask);
  } catch { return false; }
}

function subnetUsable(cidr: string): number {
  const prefix = parseInt(cidr.split("/")[1]);
  if (prefix >= 31) return 2 ** (32 - prefix);
  return Math.max(0, 2 ** (32 - prefix) - 2);
}

function isOnline(d: Date | null) {
  return d && Date.now() - new Date(d).getTime() < 5 * 60 * 1000;
}

export function NetworkDashboard({ vlans: initial, agents }: { vlans: Vlan[]; agents: Agent[] }) {
  const [vlans, setVlans] = useState(initial);
  const [adComputers, setAdComputers] = useState<AdComputer[]>([]);
  const [adLoading, setAdLoading] = useState(false);
  const [dhcpLoading, setDhcpLoading] = useState(false);
  const [showTextImport, setShowTextImport] = useState(false);
  const [textSubnets, setTextSubnets] = useState("");
  const [isPending, startTransition] = useTransition();
  const [newVlan, setNewVlan] = useState({ name: "", subnet: "", gateway: "", description: "" });
  const [showAddVlan, setShowAddVlan] = useState(false);
  const [expandedVlan, setExpandedVlan] = useState<string | null>(null);
  const [visibleClients, setVisibleClients] = useState<Record<string, number>>({});

  const importDhcp = async () => {
    setDhcpLoading(true);
    try {
      const res = await fetch("/api/admin/network/dhcp-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "ad" }) });
      const data = await res.json();
      if (!res.ok) {
        if (data.hint === "text") {
          toast.error("DHCP nicht in AD gefunden — bitte Subnetze manuell eingeben");
          setShowTextImport(true);
        } else {
          toast.error(data.error.split("\n")[0]);
        }
        return;
      }
      toast.success(`DHCP-Import: ${data.created} neue VLANs, ${data.skipped} übersprungen`);
      window.location.reload();
    } catch { toast.error("DHCP-Import fehlgeschlagen"); }
    finally { setDhcpLoading(false); }
  };

  const importText = async () => {
    if (!textSubnets.trim()) return;
    setDhcpLoading(true);
    try {
      const res = await fetch("/api/admin/network/dhcp-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "text", subnets: textSubnets }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`${data.created} VLANs importiert, ${data.skipped} übersprungen`);
      setShowTextImport(false);
      setTextSubnets("");
      window.location.reload();
    } catch { toast.error("Import fehlgeschlagen"); }
    finally { setDhcpLoading(false); }
  };

  const loadAdComputers = async () => {
    setAdLoading(true);
    try {
      const res = await fetch("/api/admin/network/ad-scan");
      if (!res.ok) { toast.error((await res.json()).error); return; }
      setAdComputers(await res.json());
      toast.success("AD-Scan abgeschlossen");
    } catch { toast.error("AD-Scan fehlgeschlagen"); }
    finally { setAdLoading(false); }
  };

  const handleAddVlan = () => {
    if (!newVlan.name.trim() || !newVlan.subnet.trim()) { toast.error("Name und Subnet erforderlich"); return; }
    startTransition(async () => {
      const res = await fetch("/api/admin/network/vlans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newVlan),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setVlans((v) => [...v, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewVlan({ name: "", subnet: "", gateway: "", description: "" });
      setShowAddVlan(false);
      toast.success("VLAN erstellt");
    });
  };

  const handleDeleteVlan = (id: string, name: string) => {
    if (!confirm(`VLAN "${name}" löschen?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/network/vlans?id=${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Fehler beim Löschen"); return; }
      setVlans((v) => v.filter((x) => x.id !== id));
      toast.success("VLAN gelöscht");
    });
  };

  // Merge agents + AD computers per VLAN
  const vlanStats = useMemo(() => vlans.map((vlan) => {
    const allHosts = new Map<string, { ip: string; name: string; online: boolean; source: string; os?: string; lastSeen?: string }>();

    agents.forEach((a) => {
      if (a.ipAddress && ipInSubnet(a.ipAddress, vlan.subnet)) {
        allHosts.set(a.ipAddress, {
          ip: a.ipAddress, name: a.hostname, online: !!isOnline(a.lastSeenAt),
          source: "agent", os: a.osVersion ?? undefined,
          lastSeen: a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : undefined,
        });
      }
    });

    adComputers.forEach((c) => {
      if (c.ipAddress && ipInSubnet(c.ipAddress, vlan.subnet) && !allHosts.has(c.ipAddress)) {
        allHosts.set(c.ipAddress, {
          ip: c.ipAddress, name: c.hostname, online: false,
          source: "ad", os: c.os, lastSeen: c.lastLogon,
        });
      }
    });

    const usable = subnetUsable(vlan.subnet);
    const used = allHosts.size;
    const free = Math.max(0, usable - used);
    const pct = usable > 0 ? Math.round((used / usable) * 100) : 0;

    return { vlan, hosts: [...allHosts.values()].sort((a, b) => a.name.localeCompare(b.name)), usable, used, free, pct };
  }), [vlans, agents, adComputers]);

  const criticalVlans = vlanStats.filter((v) => v.free <= 5 && v.usable > 0);
  const unassigned = agents.filter((a) => a.ipAddress && !vlans.some((v) => ipInSubnet(a.ipAddress!, v.subnet)));

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" /> Netzwerk
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{vlans.length} VLANs · {agents.length} Agents</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={loadAdComputers} disabled={adLoading}>
            {adLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            AD-Scan
          </Button>
          <Button size="sm" variant="outline" onClick={importDhcp} disabled={dhcpLoading}>
            {dhcpLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}
            VLANs aus DHCP
          </Button>
          <Button size="sm" onClick={() => setShowAddVlan((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> VLAN manuell
          </Button>
        </div>
      </div>

      {/* Warning: VLANs almost full */}
      {criticalVlans.length > 0 && (
        <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-4 space-y-1.5">
          <p className="text-sm font-semibold text-yellow-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {criticalVlans.length} VLAN{criticalVlans.length > 1 ? "s" : ""} fast voll
          </p>
          {criticalVlans.map((v) => (
            <p key={v.vlan.id} className="text-xs text-yellow-400/80">
              {v.vlan.name} ({v.vlan.subnet}) — nur noch <strong>{v.free}</strong> freie IPs
            </p>
          ))}
        </div>
      )}

      {/* Text subnet import */}
      {showTextImport && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Subnetze manuell eingeben</h3>
            <button onClick={() => setShowTextImport(false)} className="text-muted-foreground hover:text-foreground text-xs">Schließen</button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ein Subnet pro Zeile: <code className="bg-muted px-1 rounded">172.29.13.0/24 Management</code>
          </p>
          <textarea
            value={textSubnets}
            onChange={(e) => setTextSubnets(e.target.value)}
            placeholder={"172.29.13.0/24 Management\n172.29.14.0/24 Server\n172.29.15.0/24 Clients"}
            className="w-full h-32 rounded-md border border-border bg-background text-xs font-mono px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={importText} disabled={dhcpLoading || !textSubnets.trim()}>
              {dhcpLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Importieren
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowTextImport(false)}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* Add VLAN form */}
      {showAddVlan && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Neues VLAN</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Name (z.B. Management)" value={newVlan.name} onChange={(e) => setNewVlan((v) => ({ ...v, name: e.target.value }))} className="h-8 text-sm" />
            <Input placeholder="Subnet (z.B. 172.29.13.0/24)" value={newVlan.subnet} onChange={(e) => setNewVlan((v) => ({ ...v, subnet: e.target.value }))} className="h-8 text-sm font-mono" />
            <Input placeholder="Gateway (optional)" value={newVlan.gateway} onChange={(e) => setNewVlan((v) => ({ ...v, gateway: e.target.value }))} className="h-8 text-sm font-mono" />
            <Input placeholder="Beschreibung (optional)" value={newVlan.description} onChange={(e) => setNewVlan((v) => ({ ...v, description: e.target.value }))} className="h-8 text-sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddVlan} disabled={isPending}>Erstellen</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddVlan(false)}>Abbrechen</Button>
          </div>
        </div>
      )}

      {/* VLAN cards */}
      {vlans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Noch keine VLANs definiert — oben "VLAN" klicken und Subnet eintragen (z.B. 172.29.13.0/24)
        </div>
      ) : (
        <div className="space-y-4">
          {vlanStats.map(({ vlan, hosts, usable, used, free, pct }) => {
            const isExpanded = expandedVlan === vlan.id;
            const shown = visibleClients[vlan.id] ?? 10;
            const isCritical = free <= 5;
            return (
              <div key={vlan.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* VLAN header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{vlan.name}</h3>
                        {isCritical && <span className="text-xs text-yellow-400 bg-yellow-400/10 rounded px-1.5 py-0.5 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {free} frei</span>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{vlan.subnet}{vlan.gateway ? ` · GW: ${vlan.gateway}` : ""}</p>
                      {vlan.description && <p className="text-xs text-muted-foreground mt-0.5">{vlan.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right text-xs text-muted-foreground">
                        <p><span className="text-foreground font-medium">{used}</span> / {usable} belegt</p>
                        <p className={isCritical ? "text-yellow-400" : ""}>{free} frei</p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteVlan(vlan.id, vlan.name)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-400" : pct >= 75 ? "bg-yellow-400" : "bg-primary"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{pct}% belegt</p>
                  </div>

                  {/* Toggle clients */}
                  {hosts.length > 0 && (
                    <button onClick={() => setExpandedVlan(isExpanded ? null : vlan.id)}
                      className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {hosts.length} Client{hosts.length !== 1 ? "s" : ""} {isExpanded ? "ausblenden" : "anzeigen"}
                    </button>
                  )}
                </div>

                {/* Client list */}
                {isExpanded && hosts.length > 0 && (
                  <div className="border-t border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Hostname</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">IP</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">OS</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Letzter Kontakt</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Quelle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {hosts.slice(0, shown).map((h) => (
                          <tr key={h.ip} className="hover:bg-muted/20">
                            <td className="px-4 py-2 font-medium text-foreground flex items-center gap-1.5">
                              {h.online
                                ? <Wifi className="h-3 w-3 text-green-400 shrink-0" />
                                : <WifiOff className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                              {h.name}
                            </td>
                            <td className="px-4 py-2 font-mono text-muted-foreground">{h.ip}</td>
                            <td className="px-4 py-2 text-muted-foreground hidden sm:table-cell truncate max-w-[180px]">{h.os ?? "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{h.lastSeen ?? "—"}</td>
                            <td className="px-4 py-2">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${h.source === "agent" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                {h.source === "agent" ? "Agent" : "AD"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {hosts.length > 10 && (
                      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/10 text-xs text-muted-foreground">
                        <span>{Math.min(shown, hosts.length)} von {hosts.length}</span>
                        <div className="flex gap-3">
                          {shown < hosts.length && (
                            <button onClick={() => setVisibleClients((v) => ({ ...v, [vlan.id]: Math.min(shown + 10, hosts.length) }))}
                              className="hover:text-foreground transition-colors">
                              {Math.min(10, hosts.length - shown)} weitere
                            </button>
                          )}
                          {shown > 10 && (
                            <button onClick={() => setVisibleClients((v) => ({ ...v, [vlan.id]: 10 }))}
                              className="hover:text-foreground transition-colors">Ausblenden</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned agents */}
      {unassigned.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            Keinem VLAN zugeordnet ({unassigned.length})
          </h3>
          <div className="space-y-1">
            {unassigned.map((a) => (
              <p key={a.hostname} className="text-xs text-muted-foreground">
                {a.hostname} · <span className="font-mono">{a.ipAddress ?? "keine IP"}</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
