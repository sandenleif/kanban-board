"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MonitorSmartphone, Package, CheckCircle2, XCircle, Clock, Loader2, Trash2, Key,
         Wifi, WifiOff, RefreshCw, Copy, Terminal, Download, FolderPlus, Folder, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAgentAction, pushAgentUpdateAction, createGroupAction, deleteGroupAction, setAgentGroupsAction } from "@/actions/software";
import { regenerateEnrollmentTokenAction } from "@/actions/settings";
import { toast } from "sonner";
import type { JobStatus } from "@prisma/client";

type Pkg   = { id: string; name: string; version: string | null; type: string; _count: { jobs: number } };
type Agent = {
  id: string; hostname: string; ipAddress: string | null; lastSeenAt: Date | null;
  agentVersion: string | null; asset: { name: string } | null;
  groups: { groupId: string }[]; _count: { jobs: number }
};
type Group = { id: string; name: string; _count: { members: number } };
type Job   = { id: string; status: JobStatus; createdAt: Date; package: { id: string; name: string }; agent: { id: string; hostname: string } };

const JOB_COLOR: Record<JobStatus, string> = {
  PENDING: "text-muted-foreground", RUNNING: "text-blue-400",
  SUCCESS: "text-green-400", FAILED: "text-red-400", CANCELLED: "text-muted-foreground/50",
};
const JOB_LABEL: Record<JobStatus, string> = {
  PENDING: "Ausstehend", RUNNING: "Läuft", SUCCESS: "Erfolgreich", FAILED: "Fehlgeschlagen", CANCELLED: "Abgebrochen",
};

function ShowMore({ total, visible, onMore, onLess }: { total: number; visible: number; onMore: () => void; onLess: () => void }) {
  return (
    <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
      <span>{Math.min(visible, total)} von {total}</span>
      <div className="flex gap-2">
        {visible < total && (
          <button onClick={onMore} className="flex items-center gap-0.5 hover:text-foreground transition-colors">
            <ChevronDown className="h-3 w-3" /> {Math.min(10, total - visible)} weitere
          </button>
        )}
        {visible > 10 && (
          <button onClick={onLess} className="flex items-center gap-0.5 hover:text-foreground transition-colors">
            <ChevronUp className="h-3 w-3" /> Ausblenden
          </button>
        )}
      </div>
    </div>
  );
}

function isOnline(lastSeenAt: Date | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
}

function displayName(a: Agent) {
  return a.asset?.name ?? a.hostname;
}

export function SoftwareDashboard({ packages, agents, groups, recentJobs, isAdmin, enrollmentToken: initialToken }: {
  packages: Pkg[]; agents: Agent[]; groups: Group[]; recentJobs: Job[]; isAdmin: boolean; enrollmentToken: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [token, setToken] = useState(initialToken);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [visiblePkgs, setVisiblePkgs] = useState(10);
  const [visibleAgents, setVisibleAgents] = useState(10);
  const [visibleJobs, setVisibleJobs] = useState(10);

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

  const handleDeleteAgent = (id: string, name: string) => {
    if (!confirm(`PC "${name}" wirklich entfernen?`)) return;
    startTransition(async () => {
      const r = await deleteAgentAction(id);
      if (r.error) toast.error(r.error);
      else { toast.success("PC entfernt"); router.refresh(); }
    });
  };

  const handleUpdateAgent = (id: string, name: string) => {
    if (!confirm(`Agent auf "${name}" aktualisieren?`)) return;
    startTransition(async () => {
      const r = await pushAgentUpdateAction([id]);
      if (r.error) toast.error(r.error);
      else { toast.success("Update-Job erstellt"); router.refresh(); }
    });
  };

  const handleUpdateAll = () => {
    if (!confirm(`Agent auf allen ${agents.length} PCs aktualisieren?`)) return;
    startTransition(async () => {
      const r = await pushAgentUpdateAction(agents.map((a) => a.id));
      if (r.error) toast.error(r.error);
      else { toast.success(`${r.jobCount} Update-Jobs erstellt`); router.refresh(); }
    });
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    startTransition(async () => {
      const r = await createGroupAction(newGroupName.trim());
      if (r.error) toast.error(r.error);
      else { setNewGroupName(""); toast.success("Gruppe erstellt"); router.refresh(); }
    });
  };

  const handleDeleteGroup = (id: string, name: string) => {
    if (!confirm(`Gruppe "${name}" löschen?`)) return;
    startTransition(async () => {
      const r = await deleteGroupAction(id);
      if (r.error) toast.error(r.error);
      else { toast.success("Gruppe gelöscht"); router.refresh(); }
    });
  };

  const handleToggleAgentGroup = (agent: Agent, groupId: string) => {
    const current = agent.groups.map((g) => g.groupId);
    const next = current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId];
    startTransition(async () => {
      const r = await setAgentGroupsAction(agent.id, next);
      if (r.error) toast.error(r.error);
      else router.refresh();
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
              {packages.slice(0, visiblePkgs).map((p) => (
                <Link key={p.id} href={`/software/packages/${p.id}`}
                  className="block rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.type}{p.version ? ` · v${p.version}` : ""}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{p._count.jobs} Jobs</span>
                  </div>
                </Link>
              ))}
              {packages.length > 10 && (
                <ShowMore total={packages.length} visible={visiblePkgs} onMore={() => setVisiblePkgs((v) => Math.min(v + 10, packages.length))} onLess={() => setVisiblePkgs(10)} />
              )}
            </div>
          )}
        </div>

        {/* PCs + Groups */}
        <div className="lg:col-span-1 space-y-4">

          {/* Enrollment token */}
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

          {/* Agents */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MonitorSmartphone className="h-4 w-4 text-primary" /> PCs ({agents.length})
              </h2>
              {isAdmin && agents.length > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleUpdateAll} disabled={isPending}>
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Alle aktualisieren
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {agents.slice(0, visibleAgents).map((a) => {
                const online = isOnline(a.lastSeenAt);
                const name   = displayName(a);
                return (
                  <div key={a.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {online ? <Wifi className="h-3.5 w-3.5 text-green-400 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {a.hostname}{a.hostname !== name ? "" : ""} · {a.ipAddress ?? "—"}
                            {a.agentVersion && <span className="ml-1 text-muted-foreground/60">· v{a.agentVersion}</span>}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Gruppen zuweisen"
                            onClick={() => setEditingGroupId(editingGroupId === a.id ? null : a.id)} disabled={isPending}>
                            <Folder className={`h-3.5 w-3.5 ${a.groups.length > 0 ? "text-primary" : "text-muted-foreground"}`} />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Agent aktualisieren"
                            onClick={() => handleUpdateAgent(a.id, name)} disabled={isPending}>
                            <Download className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="PC entfernen"
                            onClick={() => handleDeleteAgent(a.id, name)} disabled={isPending}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {/* Group assignment popover */}
                    {editingGroupId === a.id && groups.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium">Gruppen:</p>
                        {groups.map((g) => {
                          const inGroup = a.groups.some((m) => m.groupId === g.id);
                          return (
                            <button key={g.id}
                              onClick={() => handleToggleAgentGroup(a, g.id)}
                              className="flex items-center gap-2 w-full text-xs rounded px-2 py-1 hover:bg-muted transition-colors text-left">
                              <span className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${inGroup ? "bg-primary border-primary" : "border-border"}`}>
                                {inGroup && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                              </span>
                              {g.name}
                            </button>
                          );
                        })}
                        {groups.length === 0 && <p className="text-xs text-muted-foreground">Keine Gruppen — unten erstellen.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
              {agents.length === 0 && <p className="text-xs text-muted-foreground">Noch keine PCs registriert.</p>}
              {agents.length > 10 && (
                <ShowMore total={agents.length} visible={visibleAgents} onMore={() => setVisibleAgents((v) => Math.min(v + 10, agents.length))} onLess={() => setVisibleAgents(10)} />
              )}
            </div>
          </div>

          {/* Groups */}
          {isAdmin && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Folder className="h-4 w-4 text-primary" /> Gruppen ({groups.length})
              </h2>
              <div className="space-y-1.5">
                {groups.map((g) => (
                  <div key={g.id} className="rounded-lg border border-border bg-card px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{g._count.members} PCs</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteGroup(g.id, g.name)} disabled={isPending}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="Gruppenname…" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                  className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()} />
                <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" onClick={handleCreateGroup} disabled={isPending || !newGroupName.trim()}>
                  <FolderPlus className="h-3.5 w-3.5" /> Erstellen
                </Button>
              </div>
            </div>
          )}
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
              {recentJobs.slice(0, visibleJobs).map((j) => (
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
          {recentJobs.length > 10 && (
            <ShowMore total={recentJobs.length} visible={visibleJobs} onMore={() => setVisibleJobs((v) => Math.min(v + 10, recentJobs.length))} onLess={() => setVisibleJobs(10)} />
          )}
        </div>
      </div>
    </div>
  );
}
