"use client";

import { useState } from "react";
import { Terminal, Loader2, Wifi, Search, Route } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Cmd = "ping" | "nslookup" | "traceroute";

const CMD_LABELS: Record<Cmd, { label: string; icon: typeof Wifi }> = {
  ping:       { label: "Ping",        icon: Wifi    },
  nslookup:   { label: "nslookup",    icon: Search  },
  traceroute: { label: "Traceroute",  icon: Route   },
};

export function NetworkDiagPanel() {
  const [host, setHost] = useState("");
  const [loading, setLoading] = useState<Cmd | null>(null);
  const [result, setResult] = useState<{ cmd: Cmd; ok: boolean; output: string } | null>(null);

  const run = async (cmd: Cmd) => {
    if (!host.trim()) return;
    setLoading(cmd);
    setResult(null);
    try {
      const res = await fetch("/api/admin/network/diag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: host.trim(), command: cmd }),
      });
      const data = await res.json();
      setResult({ cmd, ok: data.ok, output: data.output ?? data.error ?? "Kein Output" });
    } catch (err) {
      setResult({ cmd, ok: false, output: String(err) });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <Terminal className="h-3.5 w-3.5 text-primary" /> Netzwerk-Diagnose
      </p>

      <div className="flex gap-2">
        <Input
          placeholder="Hostname oder IP (z.B. C1IT12 oder 172.29.13.100)"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run("ping")}
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {(Object.entries(CMD_LABELS) as [Cmd, typeof CMD_LABELS[Cmd]][]).map(([cmd, { label, icon: Icon }]) => (
          <Button key={cmd} size="sm" variant="outline" className="h-7 text-xs gap-1.5"
            onClick={() => run(cmd)} disabled={!!loading || !host.trim()}>
            {loading === cmd
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Icon className="h-3 w-3" />}
            {label}
          </Button>
        ))}
      </div>

      {result && (
        <div className={`rounded-md border px-3 py-2 ${result.ok ? "border-border bg-background" : "border-red-400/20 bg-red-400/5"}`}>
          <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
            {CMD_LABELS[result.cmd].label} → {host}
            {!result.ok && <span className="ml-2 text-red-400">Fehler / Host nicht erreichbar</span>}
          </p>
          <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
            {result.output}
          </pre>
        </div>
      )}
    </div>
  );
}
