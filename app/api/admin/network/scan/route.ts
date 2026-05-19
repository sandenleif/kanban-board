// Manual VLAN scan trigger — delegates to shared lib/network-scanner
// POST /api/admin/network/scan  body: { vlanId }

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scanVlan } from "@/lib/network-scanner";

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

  try {
    const { activeCount, totalPinged } = await scanVlan(vlanId);

    // Get the scan ID we just created
    const latest = await prisma.networkScan.findFirst({
      where: { vlanId },
      orderBy: { scannedAt: "desc" },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, scanId: latest?.id, activeCount, totalPinged, subnet: vlan.subnet });
  } catch (err) {
    return NextResponse.json({ error: `Scan fehlgeschlagen: ${String(err)}` }, { status: 500 });
  }
}
