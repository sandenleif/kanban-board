import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const att = await prisma.attachment.findUnique({
    where: { id },
    select: { name: true, mimeType: true, fileData: true, size: true },
  });

  if (!att?.fileData) return new NextResponse("Not found", { status: 404 });

  const buffer = Buffer.from(att.fileData, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(att.name)}"`,
      "Content-Length": String(att.size),
    },
  });
}
