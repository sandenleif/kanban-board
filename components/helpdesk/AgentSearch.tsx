"use client";

import { useState, useRef, useEffect } from "react";
import { Monitor, Wifi, WifiOff, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export type AgentInfo = {
  id: string; hostname: string; ipAddress: string | null;
  osVersion: string | null; cpuName: string | null; cpuCores: number | null;
  ramGb: number | null; diskGb: number | null;
  manufacturer: string | null; model: string | null;
  agentVersion: string | null; lastSeenAt: Date | null;
  asset: { name: string } | null;
};

interface Props {
  onAgentSelected: (agent: AgentInfo | null) => void;
}

export function AgentSearch({ onAgentSelected }: Props) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<AgentInfo[]>([]);
  const [loading, setLoading]   = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [selected, setSelected] = useState<AgentInfo | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 2) { setResults([]); setShowDrop(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/helpdesk/agent-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data);
        setShowDrop(true);
      } finally { setLoading(false); }
    }, 250);
  };

  const select = (agent: AgentInfo) => {
    setSelected(agent);
    setQuery(agent.asset?.name ?? agent.hostname);
    setShowDrop(false);
    onAgentSelected(agent);
  };

  const clear = () => {
    setSelected(null);
    setQuery("");
    setResults([]);
    onAgentSelected(null);
  };

  const isOnline = (d: Date | null) => d && Date.now() - new Date(d).getTime() < 5 * 60 * 1000;

  return (
    <div ref={dropRef} className="relative">
      <input type="hidden" name="inventoryNumber" value={selected?.hostname ?? ""} />
      <div className="relative">
        <Monitor className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); if (!e.target.value) clear(); }}
          placeholder="PC suchen (Hostname, IP, Modell…)"
          className="pl-9 pr-9"
          autoComplete="off"
        />
        {loading
          ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          : <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-40" />}
      </div>

      {showDrop && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
          {results.length === 0
            ? <p className="px-3 py-2 text-xs text-muted-foreground">Keine PCs gefunden</p>
            : results.map((a) => (
                <button key={a.id} type="button" onMouseDown={() => select(a)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left">
                  {isOnline(a.lastSeenAt)
                    ? <Wifi className="h-4 w-4 text-green-400 shrink-0" />
                    : <WifiOff className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{a.asset?.name ?? a.hostname}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.hostname} · {a.ipAddress ?? "—"} · {a.osVersion?.split(" ")[0] ?? "—"}
                    </p>
                  </div>
                </button>
              ))
          }
        </div>
      )}
    </div>
  );
}

export function AgentHardwareCard({ agent }: { agent: AgentInfo }) {
  const isOnline = agent.lastSeenAt && Date.now() - new Date(agent.lastSeenAt).getTime() < 5 * 60 * 1000;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Monitor className="h-3 w-3" /> PC-Hardware
        </h3>
        <span className={`text-[10px] rounded px-1.5 py-0.5 ${isOnline ? "text-green-400 bg-green-400/10" : "text-muted-foreground bg-muted"}`}>
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>
      <div className="px-4 py-3 space-y-1.5 text-xs">
        <p className="font-medium text-foreground">{agent.asset?.name ?? agent.hostname}</p>
        {agent.hostname !== (agent.asset?.name ?? agent.hostname) && (
          <p className="text-muted-foreground font-mono">{agent.hostname}</p>
        )}
        {agent.ipAddress   && <p className="text-muted-foreground">IP: {agent.ipAddress}</p>}
        {agent.osVersion   && <p className="text-muted-foreground truncate">{agent.osVersion}</p>}
        {agent.cpuName     && <p className="text-muted-foreground truncate">{agent.cpuName}{agent.cpuCores ? ` (${agent.cpuCores} Kerne)` : ""}</p>}
        <div className="flex gap-3 text-muted-foreground">
          {agent.ramGb  && <span>{agent.ramGb} GB RAM</span>}
          {agent.diskGb && <span>{agent.diskGb} GB HDD</span>}
        </div>
        {agent.lastSeenAt && (
          <p className="text-muted-foreground/60">
            Zuletzt: {new Date(agent.lastSeenAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}
