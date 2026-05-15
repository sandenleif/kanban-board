// Streaming file upload for software packages — avoids Server Action memory limits
// POST /api/software/upload  (multipart/form-data)
// Fields: name, version, description, installParams, uninstallParams, file

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const UPLOAD_DIR = join(process.cwd(), "uploads", "packages");

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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const name        = (formData.get("name") as string)?.trim();
  const version     = (formData.get("version") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const installParams   = (formData.get("installParams") as string)?.trim() || null;
  const uninstallParams = (formData.get("uninstallParams") as string)?.trim() || null;
  const file        = formData.get("file") as File | null;

  if (!name) return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });

  let fileName: string | null = null;
  let filePath: string | null = null;

  if (file && file.size > 0) {
    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pkgId    = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dir      = join(UPLOAD_DIR, pkgId);

    await mkdir(dir, { recursive: true });
    const dest = join(dir, safeName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(dest, buffer);

    fileName = safeName;
    filePath = `${pkgId}/${safeName}`;
  }

  const pkg = await prisma.softwarePackage.create({
    data: {
      organizationId: user.organizationId,
      name,
      version,
      description,
      installParams,
      uninstallParams,
      type:     filePath ? "file" : "winget",
      fileName: fileName,
      // Store file path in wingetId field temporarily, or add filePath field
      // We use a dedicated filePath field — add it via a new column approach:
      // For now store path in fileData as a path marker
      fileData: filePath ? `__path__${filePath}` : null,
      fileMimeType: file?.type || null,
    },
  });

  return NextResponse.json({ ok: true, id: pkg.id });
}
