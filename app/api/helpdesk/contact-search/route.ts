import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Search for contacts in Exchange-synced data via Elasticsearch
// Falls back to returning users from the org if no ES
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) return NextResponse.json([]);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return NextResponse.json([]);

  // When Elasticsearch is configured: search indexed AD/Exchange contacts
  const esUrl = process.env.ELASTICSEARCH_URL;
  if (esUrl) {
    try {
      const res = await fetch(`${esUrl}/kanban_contacts/_search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          size: 10,
          query: {
            bool: {
              must: [
                { term: { organizationId: user.organizationId } },
                { multi_match: { query: q, fields: ["name^2", "email"], fuzziness: "AUTO" } },
              ],
            },
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const hits = data.hits?.hits ?? [];
        if (hits.length > 0) {
          return NextResponse.json(
            hits.map((h: { _source: { name: string; email: string } }) => ({
              name: h._source.name,
              email: h._source.email,
              source: "ad",
            }))
          );
        }
      }
    } catch {
      // Fall through to org user search
    }
  }

  // Fallback: search org users
  const users = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      status: "ACTIVE",
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { name: true, email: true },
    take: 10,
  });

  return NextResponse.json(
    users.map((u) => ({ name: u.name, email: u.email, source: "manual" as const }))
  );
}
