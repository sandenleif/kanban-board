// Serve user avatar from filesystem (preferred) or base64 DB (legacy)
// GET /api/files/avatar/[userId]

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";

const UPLOAD_DIR = join(process.cwd(), "uploads");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPath: true, avatarBase64: true, avatarMimeType: true },
  });
  if (!user) return new NextResponse(null, { status: 404 });

  if (user.avatarPath) {
    try {
      const buf = await readFile(join(UPLOAD_DIR, user.avatarPath));
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": user.avatarMimeType ?? "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch { /* fall through */ }
  }

  if (user.avatarBase64 && user.avatarMimeType) {
    const buf = Buffer.from(user.avatarBase64, "base64");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": user.avatarMimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new NextResponse(null, { status: 404 });
}
