// Receives subnet scan results from agents (they can ping their local VLAN)
// POST /api/agent/scan-result
// Auth: Authorization: Bearer <apiKey>

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const apiKey = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.softwareAgent.findUnique({
    where: { apiKey },
    select: { id: true, organizationId: true, hostname: true },
  });
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { subnet, activeCount, totalPinged, results } = body;

  if (!subnet) return NextResponse.json({ error: "subnet required" }, { status: 400 });

  // Find matching VLAN
  const vlan = await prisma.networkVlan.findFirst({
    where: { organizationId: agent.organizationId, subnet },
  });

  if (!vlan) {
    // Unknown subnet — still store it if we can match by prefix
    const prefix = subnet.split("/")[0].split(".").slice(0, 3).join(".");
    const vlanByPrefix = await prisma.networkVlan.findFirst({
      where: { organizationId: agent.organizationId, subnet: { startsWith: prefix } },
    });
    if (!vlanByPrefix) return NextResponse.json({ ok: true, skipped: true });

    await saveScan(vlanByPrefix.id, activeCount, totalPinged, results);
    return NextResponse.json({ ok: true, vlanId: vlanByPrefix.id });
  }

  await saveScan(vlan.id, activeCount, totalPinged, results);
  return NextResponse.json({ ok: true, vlanId: vlan.id });
}

async function saveScan(vlanId: string, activeCount: number, totalPinged: number, results: object[]) {
  await prisma.networkScan.create({
    data: { vlanId, activeCount, totalPinged, results },
  });
  const old = await prisma.networkScan.findMany({
    where: { vlanId },
    orderBy: { scannedAt: "desc" },
    skip: 5,
    select: { id: true },
  });
  if (old.length > 0) {
    await prisma.networkScan.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}
