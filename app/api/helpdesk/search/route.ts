import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchTickets, elasticEnabled } from "@/lib/elasticsearch";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return NextResponse.json({ error: "No org" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit = 25;

  if (!q) return NextResponse.json({ tickets: [], total: 0, engine: "db" });

  const orgId = user.organizationId;

  // Try Elasticsearch first
  if (elasticEnabled) {
    const esResult = await searchTickets(q, orgId, (page - 1) * limit, limit);
    if (esResult) {
      const tickets = await prisma.ticket.findMany({
        where: { id: { in: esResult.ids }, organizationId: orgId },
        include: {
          queue: { select: { name: true } },
          team:  { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      // Preserve ES relevance order
      const map = new Map(tickets.map((t) => [t.id, t]));
      const ordered = esResult.ids.map((id) => map.get(id)).filter(Boolean);
      return NextResponse.json({ tickets: ordered, total: esResult.total, engine: "elasticsearch" });
    }
  }

  // Fallback: DB full-text search
  const where = {
    organizationId: orgId,
    OR: [
      { title:           { contains: q, mode: "insensitive" as const } },
      { description:     { contains: q, mode: "insensitive" as const } },
      { topic:           { contains: q, mode: "insensitive" as const } },
      { inventoryNumber: { contains: q, mode: "insensitive" as const } },
      { fromEmail:       { contains: q, mode: "insensitive" as const } },
      { fromName:        { contains: q, mode: "insensitive" as const } },
    ],
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        queue: { select: { name: true } },
        team:  { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return NextResponse.json({ tickets, total, engine: "db" });
}
