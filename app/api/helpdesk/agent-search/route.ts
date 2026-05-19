// Search agents/assets for the ticket inventory field
// GET /api/helpdesk/agent-search?q=hostname

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return NextResponse.json([]);

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const agents = await prisma.softwareAgent.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { hostname:     { contains: q, mode: "insensitive" } },
        { ipAddress:    { contains: q, mode: "insensitive" } },
        { manufacturer: { contains: q, mode: "insensitive" } },
        { model:        { contains: q, mode: "insensitive" } },
        { asset: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true, hostname: true, ipAddress: true, osVersion: true,
      cpuName: true, cpuCores: true, ramGb: true, diskGb: true,
      manufacturer: true, model: true, agentVersion: true, lastSeenAt: true,
      asset: { select: { name: true } },
    },
    take: 10,
    orderBy: { hostname: "asc" },
  });

  return NextResponse.json(agents);
}
