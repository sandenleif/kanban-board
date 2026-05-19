// VLAN CRUD
// GET /api/admin/network/vlans   — list
// POST /api/admin/network/vlans  — create
// DELETE /api/admin/network/vlans?id=xxx — delete

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.isAdmin || !user.organizationId) return null;
  return user;
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const vlans = await prisma.networkVlan.findMany({
    where: { organizationId: user.organizationId! },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(vlans);
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name, subnet, gateway, description } = await req.json();
  if (!name?.trim() || !subnet?.trim()) {
    return NextResponse.json({ error: "Name und Subnet erforderlich" }, { status: 400 });
  }
  // Validate CIDR
  if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(subnet.trim())) {
    return NextResponse.json({ error: "Ungültiges Subnet-Format (z.B. 172.29.13.0/24)" }, { status: 400 });
  }
  try {
    const vlan = await prisma.networkVlan.create({
      data: {
        organizationId: user.organizationId!,
        name: name.trim(),
        subnet: subnet.trim(),
        gateway: gateway?.trim() || null,
        description: description?.trim() || null,
      },
    });
    return NextResponse.json(vlan);
  } catch {
    return NextResponse.json({ error: "VLAN existiert bereits" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
  await prisma.networkVlan.deleteMany({ where: { id, organizationId: user.organizationId! } });
  return NextResponse.json({ ok: true });
}
