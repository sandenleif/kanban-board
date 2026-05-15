"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Trash2, CheckCircle2, XCircle, Clock, Loader2, Package, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createJobAction, cancelJobAction, deletePackageAction, updatePackageAction } from "@/actions/software";
import { toast } from "sonner";
import type { JobStatus } from "@prisma/client";

type Pkg = { id: string; name: string; version: string | null; type: string; wingetId: string | null; installParams: string | null; description: string | null };
type Agent = { id: string; hostname: string; ipAddress: string | null; lastSeenAt: Date | null };
type Job = { id: string; status: JobStatus; createdAt: Date; exitCode: number | null; log: string | null; agent: { id: string; hostname: string } };

const JOB_COLOR: Record<JobStatus, string> = {
  PENDING: "text-muted-foreground bg-muted",
  RUNNING: "text-blue-400 bg-blue-400/10",
  SUCCESS: "text-green-400 bg-green-400/10",
  FAILED:  "text-red-400 bg-red-400/10",
  CANCELLED: "text-muted-foreground/50 bg-muted",
};
const JOB_LABEL: Record<JobStatus, string> = {
  PENDING: "Ausstehend", RUNNING: "Läuft", SUCCESS: "Erfolgreich", FAILED: "Fehlgeschlagen", CANCELLED: "Abgebrochen",
};

export function PackageDetail({ pkg, agents, jobs, isAdmin }: {
  pkg: Pkg; agents: Agent[]; jobs: Job[]; isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [showDeploy, setShowDeploy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    name:           pkg.name,
    version:        pkg.version ?? "",
    wingetId:       pkg.wingetId ?? "",
    installParams:  pkg.installParams ?? "",
    description:    pkg.description ?? "",
  });

  const toggleAgent = (id: string) =>
    setSelectedAgents((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleDeploy = () => {
    if (!selectedAgents.size) { toast.error("Mindestens einen PC auswählen"); return; }
    startTransition(async () => {
      const r = await createJobAction({ packageId: pkg.id, agentIds: [...selectedAgents] });
      if (r.error) { toast.error(r.error); return; }
      toast.success(`${selectedAgents.size} Job(s) erstellt`);
      setSelectedAgents(new Set());
      setShowDeploy(false);
      router.refresh();
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const r = await updatePackageAction(pkg.id, {
        name:           editData.name.trim() || undefined,
        version:        editData.version.trim() || null,
        wingetId:       editData.wingetId.trim() || null,
        installParams:  editData.installParams.trim() || null,
        description:    editData.description.trim() || null,
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success("Gespeichert");
      setEditing(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm("Paket wirklich löschen?")) return;
    startTransition(async () => {
      const r = await deletePackageAction(pkg.id);
      if (r.error) toast.error(r.error);
      else router.push("/software");
    });
  };

  const handleCancel = (jobId: string) => {
    startTransition(async () => {
      const r = await cancelJobAction(jobId);
      if (r.error) toast.error(r.error);
      else { toast.success("Job abgebrochen"); router.refresh(); }
    });
  };

  return (
    <div className="max-w-4xl mx-auto animate-in space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/software" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Software
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-foreground">{pkg.name}</h1>
            {pkg.version && <span className="text-sm text-muted-foreground">v{pkg.version}</span>}
            <span className="text-xs bg-muted text-muted-foreground rounded px-2 py-0.5">{pkg.type}</span>
          </div>
          {pkg.description && <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowDeploy(true)}>
              <Play className="h-3.5 w-3.5" /> Ausrollen
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={editing}>
              <Pencil className="h-3.5 w-3.5" /> Bearbeiten
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {/* Package info / edit form */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Name</label>
                <Input value={editData.name} onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Version</label>
                <Input value={editData.version} onChange={(e) => setEditData((d) => ({ ...d, version: e.target.value }))} className="h-8 text-xs" placeholder="z.B. 1.0" />
              </div>
              {pkg.type === "winget" && (
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-muted-foreground">winget-ID</label>
                  <Input value={editData.wingetId} onChange={(e) => setEditData((d) => ({ ...d, wingetId: e.target.value }))} className="h-8 text-xs font-mono" placeholder="z.B. Brave.Brave" />
                </div>
              )}
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-muted-foreground">Installations-Parameter</label>
                <Input value={editData.installParams} onChange={(e) => setEditData((d) => ({ ...d, installParams: e.target.value }))} className="h-8 text-xs font-mono" placeholder="z.B. --source winget --silent" />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-muted-foreground">Beschreibung</label>
                <Textarea value={editData.description} onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))} className="text-xs" rows={2} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Speichern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditData({ name: pkg.name, version: pkg.version ?? "", wingetId: pkg.wingetId ?? "", installParams: pkg.installParams ?? "", description: pkg.description ?? "" }); }}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-xs space-y-1.5">
            {pkg.wingetId && <p><span className="text-muted-foreground w-32 inline-block">winget-ID</span><code className="font-mono">{pkg.wingetId}</code></p>}
            {pkg.installParams && <p><span className="text-muted-foreground w-32 inline-block">Install-Parameter</span><code className="font-mono">{pkg.installParams}</code></p>}
            {pkg.description && <p className="text-muted-foreground mt-1">{pkg.description}</p>}
            {!pkg.wingetId && !pkg.installParams && !pkg.description && (
              <p className="text-muted-foreground">Keine Details hinterlegt.</p>
            )}
          </div>
        )}
      </div>

      {/* Deploy modal */}
      {showDeploy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> {pkg.name} ausrollen
              </h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDeploy(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">PCs auswählen die das Paket erhalten sollen:</p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {agents.length === 0
                ? <p className="text-xs text-muted-foreground">Keine PCs registriert</p>
                : agents.map((a) => (
                    <label key={a.id} className="flex items-center gap-2.5 rounded-md px-3 py-2 hover:bg-muted cursor-pointer text-sm">
                      <input type="checkbox" checked={selectedAgents.has(a.id)} onChange={() => toggleAgent(a.id)} className="rounded" />
                      <span className="font-medium text-foreground">{a.hostname}</span>
                      <span className="text-muted-foreground text-xs">{a.ipAddress}</span>
                    </label>
                  ))
              }
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowDeploy(false)}>Abbrechen</Button>
              <Button size="sm" onClick={handleDeploy} disabled={isPending || !selectedAgents.size}>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {selectedAgents.size} PC(s) auswählen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Job history */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Job-Verlauf ({jobs.length})
        </h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Jobs — klicke "Ausrollen" um zu starten.</p>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">PC</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground hidden sm:table-cell">Erstellt</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground hidden md:table-cell">Exit-Code</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium text-foreground">{j.agent.hostname}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${JOB_COLOR[j.status]}`}>
                        {j.status === "SUCCESS" && <CheckCircle2 className="h-3 w-3" />}
                        {j.status === "FAILED" && <XCircle className="h-3 w-3" />}
                        {JOB_LABEL[j.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                      {new Date(j.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground hidden md:table-cell">
                      {j.exitCode !== null ? j.exitCode : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {j.status === "PENDING" && isAdmin && (
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleCancel(j.id)}>
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
