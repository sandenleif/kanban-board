// Orbis CSV import — POST /api/admin/orbis-import
// Body: JSON array of parsed rows from client-side CSV parsing
// Only admins can call this.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type OrbisRow = {
  kuerzel:    string;
  vorname:    string;
  nachname:   string;
  rolle:      string;
  einrichtung: string;
};

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

  const rows: OrbisRow[] = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Keine Daten" }, { status: 400 });
  }

  let imported = 0;
  let updated  = 0;
  let skipped  = 0;

  for (const row of rows) {
    if (!row.kuerzel?.trim() || !row.nachname?.trim()) { skipped++; continue; }

    const name    = `${row.vorname?.trim() ?? ""} ${row.nachname.trim()}`.trim();
    const kuerzel = row.kuerzel.trim().toUpperCase();

    const existing = await prisma.ticketContact.findUnique({
      where: { organizationId_externalId: { organizationId: user.organizationId!, externalId: kuerzel } },
    });

    if (existing) {
      await prisma.ticketContact.update({
        where: { id: existing.id },
        data: {
          name,
          department: row.rolle?.trim() || null,
          company:    row.einrichtung?.trim() || null,
          source:     "orbis",
        },
      });
      updated++;
    } else {
      await prisma.ticketContact.create({
        data: {
          organizationId: user.organizationId!,
          name,
          externalId:  kuerzel,
          department:  row.rolle?.trim() || null,
          company:     row.einrichtung?.trim() || null,
          source:      "orbis",
        },
      });
      imported++;
    }
  }

  return NextResponse.json({ ok: true, imported, updated, skipped });
}
