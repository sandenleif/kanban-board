// Serve org logo from filesystem (preferred) or base64 DB (legacy)
// GET /api/files/logo

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const UPLOAD_DIR = join(process.cwd(), "uploads");

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.organizationId) return new NextResponse(null, { status: 401 });

  const settings = await prisma.appSettings.findUnique({
    where: { organizationId: session.organizationId },
    select: { logoPath: true, logoBase64: true, logoMimeType: true },
  });

  if (settings?.logoPath) {
    try {
      const buf = await readFile(join(UPLOAD_DIR, settings.logoPath));
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": settings.logoMimeType ?? "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch { /* fall through to base64 */ }
  }

  if (settings?.logoBase64 && settings.logoMimeType) {
    const buf = Buffer.from(settings.logoBase64, "base64");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": settings.logoMimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new NextResponse(null, { status: 404 });
}
