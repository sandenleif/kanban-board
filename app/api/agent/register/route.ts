// Auto-registration endpoint for Windows PCs
// POST /api/agent/register
// Body: { enrollmentToken, hostname, hardware: { ... } }
// Returns: { apiKey, agentId, assetId }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type HardwareInfo = {
  hostname:          string;
  ipAddress?:        string;
  macAddress?:       string;
  osVersion?:        string;
  manufacturer?:     string;
  model?:            string;
  serialNumber?:     string;
  cpuName?:          string;
  cpuCores?:         number;
  ramGb?:            number;
  diskGb?:           number;
  domain?:           string;
  agentVersion?:     string;
  installedSoftware?: Array<{ name: string; version?: string; publisher?: string }>;
};

export async function POST(req: NextRequest) {
  let body: { enrollmentToken?: string; hardware?: HardwareInfo };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { enrollmentToken, hardware } = body;

  if (!hardware?.hostname) {
    return NextResponse.json({ error: "hardware.hostname required" }, { status: 400 });
  }

  // Heartbeat path: already-registered agent authenticates via Bearer token
  const auth = req.headers.get("authorization") ?? "";
  const bearerKey = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  let orgId: string;

  if (bearerKey) {
    // Registered agent updating its own hardware info
    const existing = await prisma.softwareAgent.findUnique({ where: { apiKey: bearerKey } });
    if (!existing) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    orgId = existing.organizationId;
  } else {
    // First-time registration: enrollment token required
    if (!enrollmentToken) {
      return NextResponse.json({ error: "enrollmentToken required for initial registration" }, { status: 400 });
    }
    const settings = await prisma.appSettings.findFirst({
      where: { enrollmentToken },
      select: { organizationId: true },
    });
    if (!settings) return NextResponse.json({ error: "Invalid enrollment token" }, { status: 401 });
    orgId = settings.organizationId;
  }
  const hostname = hardware.hostname.trim().toLowerCase();

  // Upsert agent — create or update hardware info
  const agentData = {
    ipAddress:    hardware.ipAddress    ?? null,
    macAddress:   hardware.macAddress   ?? null,
    osVersion:    hardware.osVersion    ?? null,
    manufacturer: hardware.manufacturer ?? null,
    model:        hardware.model        ?? null,
    serialNumber: hardware.serialNumber ?? null,
    cpuName:      hardware.cpuName      ?? null,
    cpuCores:     hardware.cpuCores     ?? null,
    ramGb:        hardware.ramGb        ?? null,
    diskGb:       hardware.diskGb       ?? null,
    domain:       hardware.domain       ?? null,
    agentVersion:      hardware.agentVersion     ?? null,
    installedSoftware: hardware.installedSoftware ?? undefined,
    lastSeenAt:        new Date(),
  };

  const agent = await prisma.softwareAgent.upsert({
    where:  { organizationId_hostname: { organizationId: orgId, hostname } },
    create: { organizationId: orgId, hostname, ...agentData },
    update: agentData,
  });

  // Auto-create or update the inventory asset for this PC
  // Name is always the hostname (uppercase) — never overwritten by heartbeats
  // so admins can rename assets manually without losing their changes.
  const hostnameDisplay = hostname.toUpperCase();

  let assetId = agent.assetId;

  if (assetId) {
    // Update hardware fields only — never touch the name the admin may have set
    await prisma.asset.updateMany({
      where: { id: assetId, organizationId: orgId },
      data: {
        manufacturer: hardware.manufacturer ?? undefined,
        model:        hardware.model        ?? undefined,
        serialNumber: hardware.serialNumber ?? undefined,
        notes:        buildNotes(hardware),
      },
    });
  } else {
    // Find by serial number or hostname
    const existing = hardware.serialNumber
      ? await prisma.asset.findFirst({ where: { organizationId: orgId, serialNumber: hardware.serialNumber } })
      : await prisma.asset.findFirst({ where: { organizationId: orgId, inventoryNumber: hostname } });

    if (existing) {
      assetId = existing.id;
      await prisma.asset.update({
        where: { id: assetId },
        data: {
          manufacturer: hardware.manufacturer ?? undefined,
          model:        hardware.model        ?? undefined,
          notes:        buildNotes(hardware),
        },
      });
    } else {
      // Find "PC" / "Computer" category if available
      const category = await prisma.assetCategory.findFirst({
        where: {
          organizationId: orgId,
          name: { in: ["PC", "Computer", "Laptop", "Desktop", "Workstation"] },
        },
      });

      const newAsset = await prisma.asset.create({
        data: {
          organizationId:  orgId,
          name:            hostnameDisplay,
          inventoryNumber: hostname,
          serialNumber:    hardware.serialNumber ?? null,
          manufacturer:    hardware.manufacturer ?? null,
          model:           hardware.model        ?? null,
          categoryId:      category?.id          ?? null,
          status:          "ACTIVE",
          notes:           buildNotes(hardware),
        },
      });
      assetId = newAsset.id;
    }

    // Link agent ↔ asset
    await prisma.softwareAgent.update({
      where: { id: agent.id },
      data:  { assetId },
    });
  }

  return NextResponse.json({
    ok:      true,
    apiKey:  agent.apiKey,
    agentId: agent.id,
    assetId,
  });
}

function buildNotes(hw: HardwareInfo): string {
  const lines = [
    hw.cpuName  ? `CPU: ${hw.cpuName}${hw.cpuCores ? ` (${hw.cpuCores} Kerne)` : ""}` : null,
    hw.ramGb    ? `RAM: ${hw.ramGb} GB` : null,
    hw.diskGb   ? `Festplatte: ${hw.diskGb} GB` : null,
    hw.osVersion ? `OS: ${hw.osVersion}` : null,
    hw.domain   ? `Domäne: ${hw.domain}` : null,
    hw.macAddress ? `MAC: ${hw.macAddress}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}
