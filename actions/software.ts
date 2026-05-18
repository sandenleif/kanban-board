"use server";

import { revalidatePath } from "next/cache";
import { readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import type { ActionResult } from "./auth";

async function requireAdmin() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.isAdmin || !user.organizationId) throw new Error("Admin erforderlich");
  return { session, organizationId: user.organizationId };
}

// ── Packages ──────────────────────────────────────────────────────────────

export async function createPackageAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const { organizationId } = await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name erforderlich" };

  const type = (formData.get("type") as string) || "winget";

  let fileData: string | null = null;
  let fileName: string | null = null;
  let fileMimeType: string | null = null;

  if (type === "file") {
    const file = formData.get("file") as File | null;
    if (file && file.size > 0) {
      if (file.size > 512 * 1024 * 1024) return { error: "Datei zu groß (max. 512 MB)" };
      const buffer = Buffer.from(await file.arrayBuffer());
      fileData = buffer.toString("base64");
      fileName = file.name;
      fileMimeType = file.type || "application/octet-stream";
    }
  }

  const pkg = await prisma.softwarePackage.create({
    data: {
      organizationId,
      name,
      description:    (formData.get("description") as string)?.trim() || null,
      version:        (formData.get("version") as string)?.trim() || null,
      type,
      wingetId:       (formData.get("wingetId") as string)?.trim() || null,
      installParams:  (formData.get("installParams") as string)?.trim() || null,
      uninstallParams:(formData.get("uninstallParams") as string)?.trim() || null,
      fileData, fileName, fileMimeType,
    },
  });

  revalidatePath("/software");
  return { success: true, id: pkg.id };
}

export async function updatePackageAction(
  id: string,
  data: { name?: string; description?: string | null; version?: string | null; installParams?: string | null; uninstallParams?: string | null; wingetId?: string | null }
): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  await prisma.softwarePackage.updateMany({ where: { id, organizationId }, data });
  revalidatePath(`/software/packages/${id}`);
  revalidatePath("/software");
  return { success: true };
}

export async function deletePackageAction(id: string): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  await prisma.softwarePackage.deleteMany({ where: { id, organizationId } });
  revalidatePath("/software");
  return { success: true };
}

// ── Agents ────────────────────────────────────────────────────────────────

export async function createAgentAction(hostname: string): Promise<ActionResult & { id?: string; apiKey?: string }> {
  const { organizationId } = await requireAdmin();
  if (!hostname?.trim()) return { error: "Hostname erforderlich" };

  const agent = await prisma.softwareAgent.create({
    data: { organizationId, hostname: hostname.trim() },
  });

  revalidatePath("/software");
  return { success: true, id: agent.id, apiKey: agent.apiKey };
}

export async function deleteAgentAction(id: string): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  await prisma.softwareAgent.deleteMany({ where: { id, organizationId } });
  revalidatePath("/software");
  return { success: true };
}

// ── Jobs ──────────────────────────────────────────────────────────────────

export async function createJobAction(data: {
  packageId: string; agentIds: string[]; scheduledAt?: string;
}): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();

  if (!data.packageId || !data.agentIds.length) return { error: "Paket und mindestens ein PC erforderlich" };

  // Verify package belongs to org
  const pkg = await prisma.softwarePackage.findFirst({ where: { id: data.packageId, organizationId } });
  if (!pkg) return { error: "Paket nicht gefunden" };

  await prisma.softwareJob.createMany({
    data: data.agentIds.map((agentId) => ({
      packageId: data.packageId,
      agentId,
      status: "PENDING",
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
    })),
  });

  revalidatePath("/software");
  return { success: true };
}

export async function pushAgentUpdateAction(agentIds: string[]): Promise<ActionResult & { jobCount?: number }> {
  const { organizationId } = await requireAdmin();
  if (!agentIds.length) return { error: "Keine PCs ausgewählt" };

  // Read current agent.ps1 and compute version + SHA256
  const scriptPath = join(process.cwd(), "scripts", "agent.ps1");
  let script: Buffer;
  try {
    script = await readFile(scriptPath);
  } catch {
    return { error: "agent.ps1 nicht auf dem Server gefunden" };
  }
  const sha256   = createHash("sha256").update(script).digest("hex");
  const content  = script.toString("utf8");
  const verMatch = content.match(/\$AgentVersion\s*=\s*"([^"]+)"/);
  const version  = verMatch?.[1] ?? "unknown";

  // Find or create a hidden agent_update package for this org
  let pkg = await prisma.softwarePackage.findFirst({
    where: { organizationId, type: "agent_update" },
  });

  if (pkg) {
    // Update sha256 + version so it always reflects the current script
    pkg = await prisma.softwarePackage.update({
      where: { id: pkg.id },
      data:  { version, installParams: sha256 },
    });
  } else {
    pkg = await prisma.softwarePackage.create({
      data: {
        organizationId,
        name:          "KanbanFlow Agent",
        type:          "agent_update",
        version,
        installParams: sha256,
      },
    });
  }

  // Verify all agents belong to this org
  const validAgents = await prisma.softwareAgent.findMany({
    where: { id: { in: agentIds }, organizationId },
    select: { id: true },
  });
  if (!validAgents.length) return { error: "Keine gültigen PCs gefunden" };

  await prisma.softwareJob.createMany({
    data: validAgents.map((a) => ({
      packageId: pkg!.id,
      agentId:   a.id,
      status:    "PENDING",
    })),
  });

  revalidatePath("/software");
  return { success: true, jobCount: validAgents.length };
}

export async function cancelJobAction(id: string): Promise<ActionResult> {
  const { organizationId } = await requireAdmin();
  const job = await prisma.softwareJob.findFirst({
    where: { id },
    include: { agent: { select: { organizationId: true } } },
  });
  if (!job || job.agent.organizationId !== organizationId) return { error: "Job nicht gefunden" };
  if (job.status !== "PENDING") return { error: "Nur ausstehende Jobs können abgebrochen werden" };

  await prisma.softwareJob.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/software");
  return { success: true };
}
