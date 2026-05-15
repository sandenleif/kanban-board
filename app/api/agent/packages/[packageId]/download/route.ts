// File download endpoint for agents
// GET /api/agent/packages/[packageId]/download?apiKey=xxx

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";

const UPLOAD_DIR = join(process.cwd(), "uploads", "packages");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const { packageId } = await params;
  const apiKey = req.nextUrl.searchParams.get("apiKey");
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.softwareAgent.findUnique({ where: { apiKey } });
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pkg = await prisma.softwarePackage.findFirst({
    where: { id: packageId, organizationId: agent.organizationId },
    select: { fileData: true, fileName: true, fileMimeType: true },
  });

  if (!pkg?.fileData) return NextResponse.json({ error: "No file" }, { status: 404 });

  const mime = pkg.fileMimeType ?? "application/octet-stream";
  const name = pkg.fileName ?? "package";

  // Filesystem-stored file (uploaded via /api/software/upload)
  if (pkg.fileData.startsWith("__path__")) {
    const relPath = pkg.fileData.slice("__path__".length);
    try {
      const buffer = await readFile(join(UPLOAD_DIR, relPath));
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="${name}"`,
          "Content-Length": String(buffer.length),
        },
      });
    } catch {
      return NextResponse.json({ error: "File not found on server" }, { status: 404 });
    }
  }

  // Legacy: base64-stored in DB
  const buffer = Buffer.from(pkg.fileData, "base64");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
