// File download endpoint for agents
// GET /api/agent/packages/[packageId]/download?apiKey=xxx

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const buffer = Buffer.from(pkg.fileData, "base64");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": pkg.fileMimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${pkg.fileName ?? "package"}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
