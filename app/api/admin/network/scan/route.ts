// Manual VLAN scan trigger
// POST /api/admin/network/scan  body: { vlanId }
// - Local subnets (server can reach): fping directly
// - Remote subnets: dispatch scan_subnet job to an agent in that VLAN

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scanVlan } from "@/lib/network-scanner";

// Subnets the server can reach directly (same VLAN as server)
function isLocalSubnet(subnet: string): boolean {
  return subnet.startsWith("172.29.13.");
}

async function dispatchAgentScan(vlanId: string, orgId: string): Promise<{ ok: boolean; agentHostname?: string; error?: string }> {
  const agent = await prisma.softwareAgent.findFirst({
    where: { vlanId, organizationId: orgId },
    select: { id: true, hostname: true, organizationId: true },
  });
  if (!agent) return { ok: false, error: "Kein Agent in diesem VLAN registriert" };

  // Find or create internal scan package
  let pkg = await prisma.softwarePackage.findFirst({
    where: { type: "scan_subnet", organizationId: orgId },
    select: { id: true },
  });
  if (!pkg) {
    pkg = await prisma.softwarePackage.create({
      data: { organizationId: orgId, name: "Netzwerk-Scan (intern)", type: "scan_subnet" },
      select: { id: true },
    });
  }

  await prisma.softwareJob.create({
    data: { packageId: pkg.id, agentId: agent.id, status: "PENDING" },
  });

  return { ok: true, agentHostname: agent.hostname };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.isAdmin || !user.organizationId) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { vlanId } = await req.json();
  if (!vlanId) return NextResponse.json({ error: "vlanId erforderlich" }, { status: 400 });

  const vlan = await prisma.networkVlan.findFirst({
    where: { id: vlanId, organizationId: user.organizationId },
  });
  if (!vlan) return NextResponse.json({ error: "VLAN nicht gefunden" }, { status: 404 });

  // Local subnet — scan directly with fping
  if (isLocalSubnet(vlan.subnet)) {
    try {
      const { activeCount, totalPinged } = await scanVlan(vlanId);
      const latest = await prisma.networkScan.findFirst({
        where: { vlanId }, orderBy: { scannedAt: "desc" }, select: { id: true },
      });
      return NextResponse.json({ ok: true, mode: "direct", scanId: latest?.id, activeCount, totalPinged, subnet: vlan.subnet });
    } catch (err) {
      return NextResponse.json({ error: `Scan fehlgeschlagen: ${String(err)}` }, { status: 500 });
    }
  }

  // Remote subnet — dispatch job to agent in that VLAN
  const { ok, agentHostname, error } = await dispatchAgentScan(vlanId, user.organizationId);
  if (!ok) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    mode: "agent",
    agent: agentHostname,
    message: `Scan-Job an ${agentHostname} gesendet — Ergebnis in ~2 Minuten verfügbar`,
  });
}
