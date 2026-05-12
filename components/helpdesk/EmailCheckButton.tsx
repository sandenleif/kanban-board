"use client";

import { useState, useRef } from "react";
import { Mail, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import type { EmailCheckEvent } from "@/app/api/helpdesk/check-email/route";

export function EmailCheckButton({ lastChecked }: { lastChecked: Date | null }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle");
  const [found, setFound] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const check = async () => {
    setRunning(true);
    setLogs([]);
    setStatus("idle");
    setFound(0);
    setShowLog(true);

    const res = await fetch("/api/helpdesk/check-email");
    if (!res.ok || !res.body) {
      setLogs(["Fehler beim Verbinden"]);
      setStatus("error");
      setRunning(false);
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
          const event: EmailCheckEvent = JSON.parse(line);
          if (event.type === "log") {
            setLogs((p) => [...p, event.text]);
          } else if (event.type === "ticket") {
            setLogs((p) => [...p, `✓ Ticket #${event.number}: ${event.title}`]);
          } else if (event.type === "done") {
            setFound(event.found);
            setStatus("done");
            if (event.found > 0) router.refresh();
          } else if (event.type === "error") {
            setLogs((p) => [...p, `Fehler: ${event.message}`]);
            setStatus("error");
          }
          setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 20);
        } catch { /* ignore */ }
      }
    }
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {lastChecked && !running && (
          <span className="text-xs text-muted-foreground">Zuletzt: {formatDate(lastChecked)}</span>
        )}
        {logs.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowLog((p) => !p)}>
            Log {showLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={check} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          {running ? "Prüfe…" : "E-Mails abrufen"}
        </Button>
        {status === "done" && (
          <span className="flex items-center gap-1 text-xs text-green-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {found} neu
          </span>
        )}
        {status === "error" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
      </div>

      {showLog && logs.length > 0 && (
        <div className="absolute z-10 right-0 top-full mt-1 w-96 rounded-lg border border-border bg-black/90 max-h-48 overflow-y-auto px-3 py-2 shadow-xl">
          {logs.map((l, i) => (
            <p key={i} className={`text-xs font-mono leading-5 ${l.startsWith("✓") ? "text-green-400" : l.startsWith("Fehler") ? "text-red-400" : "text-muted-foreground"}`}>{l}</p>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
