"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MonitorSmartphone, Package, CheckCircle2, XCircle, Clock, Loader2, Trash2, Key, Wifi, WifiOff, RefreshCw, Copy, Terminal, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteAgentAction, pushAgentUpdateAction } from "@/actions/software";
import { regenerateEnrollmentTokenAction } from "@/actions/settings";
import { toast } from "sonner";
import type { JobStatus } from "@prisma/client";

type Pkg   = { id: string; name: string; version: string | null; type: string; _count: { jobs: number } };
type Agent = { id: string; hostname: string; ipAddress: string | null; lastSeenAt: Date | null; agentVersion: string | null; _count: { jobs: number } };
type Job   = { id: string; status: JobStatus; createdAt: Date; package: { id: string; name: string }; agent: { id: string; hostname: string } };

const JOB_COLOR: Record<JobStatus, string> = {
  PENDING: "text-muted-foreground", RUNNING: "text-blue-400",
  SUCCESS: "text-green-400", FAILED: "text-red-400", CANCELLED: "text-muted-foreground/50",
};
const JOB_LABEL: Record<JobStatus, string> = {
  PENDING: "Ausstehend", RUNNING: "Läuft", SUCCESS: "Erfolgreich", FAILED: "Fehlgeschlagen", CANCELLED: "Abgebrochen",
};

function isOnline(lastSeenAt: Date | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
}

export function SoftwareDashboard({ packages, agents, recentJobs, isAdmin, enrollmentToken: initialToken }: {
  packages: Pkg[]; agents: Agent[]; recentJobs: Job[]; isAdmin: boolean; enrollmentToken: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [token, setToken] = useState(initialToken);

  const handleRegenToken = () => {
    if (!confirm("Neuen Enrollment-Token generieren? Alle PCs müssen danach neu eingerichtet werden.")) return;
    startTransition(async () => {
      const r = await regenerateEnrollmentTokenAction();
      if (r.error) { toast.error(r.error); return; }
      setToken(r.token ?? null);
      toast.success("Neuer Token generiert");
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Kopiert"));
  };

  const handleDeleteAgent = (id: string, hostname: string) => {
    if (!confirm(`PC "${hostname}" wirklich entfernen?`)) return;
    startTransition(async () => {
      const r = await deleteAgentAction(id);
      if (r.error) toast.error(r.error);
      else { toast.success("PC entfernt"); router.refresh(); }
    });
  };

  const handleUpdateAgent = (id: string, hostname: string) => {
    if (!confirm(`Agent auf "${hostname}" aktualisieren?`)) return;
    startTransition(async () => {
      const r = await pushAgentUpdateAction([id]);
      if (r.error) toast.error(r.error);
      else { toast.success("Update-Job erstellt — wird beim nächsten Tick ausgeführt"); router.refresh(); }
    });
  };

  const handleUpdateAll = (agentList: Agent[]) => {
    if (!confirm(`Agent auf allen ${agentList.length} PCs aktualisieren?`)) return;
    startTransition(async () => {
      const r = await pushAgentUpdateAction(agentList.map((a) => a.id));
      if (r.error) toast.error(r.error);
      else { toast.success(`${r.jobCount} Update-Jobs erstellt`); router.refresh(); }
    });
  };

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Software-Verteilung</h1>
        {isAdmin && (
          <Button asChild size="sm"><Link href="/software/packages/new"><Plus className="h-4 w-4" /> Neues Paket</Link></Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Packages */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Pakete ({packages.length})
          </h2>
          {packages.length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch keine Pakete — <Link href="/software/packages/new" className="text-primary hover:underline">Erstes anlegen</Link></p>
          ) : (
            <div className="space-y-2">
              {packages.map((p) => (
                <Link key={p.id} href={`/software/packages/${p.id}`}
                  className="block rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.type === "winget" ? "winget" : "Datei"}{p.version ? ` · v${p.version}` : ""}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{p._count.jobs} Jobs</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Agents */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4 text-primary" /> PCs ({agents.length})
            </h2>
            {isAdmin && agents.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => handleUpdateAll(agents)} disabled={isPending}>
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                Alle aktualisieren
              </Button>
            )}
          </div>

          {isAdmin && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-primary" /> Enrollment-Token
              </p>
              {token ? (
                <>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-xs bg-background rounded border border-border px-2 py-1 truncate">{token}</code>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(token)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Script-Befehl auf dem PC (als Admin):</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-[10px] bg-background rounded border border-border px-2 py-1 text-muted-foreground break-all">
                      {`.\agent.ps1 -Setup -ServerUrl "${typeof window !== "undefined" ? window.location.origin : "http://SERVER:3000"}" -EnrollmentToken "${token}"`}
                    </code>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                      onClick={() => copyToClipboard(`.\agent.ps1 -Setup -ServerUrl "${typeof window !== "undefined" ? window.location.origin : "http://SERVER:3000"}" -EnrollmentToken "${token}"`)}>
                      <Terminal className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Kein Token vorhanden — erst generieren.</p>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleRegenToken} disabled={isPending}>
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {token ? "Neu generieren" : "Token erstellen"}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {agents.map((a) => {
              const online = isOnline(a.lastSeenAt);
              return (
                <div key={a.id} className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {online ? <Wifi className="h-3.5 w-3.5 text-green-400 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.hostname}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.ipAddress ?? "—"} · {a._count.jobs} Jobs
                        {a.agentVersion && <span className="ml-1 text-muted-foreground/60">· v{a.agentVersion}</span>}
                      </p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Agent aktualisieren"
                        onClick={() => handleUpdateAgent(a.id, a.hostname)} disabled={isPending}>
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="PC entfernen"
                        onClick={() => handleDeleteAgent(a.id, a.hostname)} disabled={isPending}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent jobs */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Letzte Jobs
          </h2>
          {recentJobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch keine Jobs</p>
          ) : (
            <div className="space-y-2">
              {recentJobs.map((j) => (
                <div key={j.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-foreground truncate">{j.package.name}</span>
                    <span className={`shrink-0 ml-2 ${JOB_COLOR[j.status]}`}>{JOB_LABEL[j.status]}</span>
                  </div>
                  <span className="text-muted-foreground">{j.agent.hostname}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
