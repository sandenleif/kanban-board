// Streaming file upload — uses busboy to pipe directly to disk, no RAM buffering
// POST /api/software/upload  (multipart/form-data)

import { NextRequest, NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
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

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  }

  try {
    const Busboy = (await import("busboy")).default;

    const fields: Record<string, string> = {};
    let fileName: string | null = null;
    let filePath: string | null = null;
    let fileMime: string | null = null;

    // Track the file write promise separately so finish doesn't race it
    let fileWritePromise: Promise<void> | null = null;

    await new Promise<void>((resolve, reject) => {
      const bb = Busboy({
        headers: Object.fromEntries(req.headers.entries()),
        limits: { fileSize: 512 * 1024 * 1024 }, // 512 MB
      });

      bb.on("field", (name, val) => { fields[name] = val; });

      bb.on("file", (fieldname, fileStream, info) => {
        const { filename, mimeType } = info;
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const pkgId    = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const dir      = join(UPLOAD_DIR, pkgId);

        fileWritePromise = (async () => {
          await mkdir(dir, { recursive: true });
          const dest = join(dir, safeName);
          const ws   = createWriteStream(dest);

          await new Promise<void>((res, rej) => {
            fileStream.pipe(ws);
            ws.on("finish", res);
            ws.on("error", rej);
            fileStream.on("error", rej);
          });

          fileName = safeName;
          filePath = `${pkgId}/${safeName}`;
          fileMime = mimeType;
        })();

        // Propagate file write errors to outer promise
        fileWritePromise.catch(reject);
      });

      bb.on("finish", async () => {
        try {
          // Wait for file write to complete before resolving
          if (fileWritePromise) await fileWritePromise;
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      bb.on("error", reject);

      Readable.fromWeb(req.body as import("stream/web").ReadableStream)
        .pipe(bb);
    });

    const name = fields.name?.trim();
    if (!name) return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });

    const pkg = await prisma.softwarePackage.create({
      data: {
        organizationId:  user.organizationId,
        name,
        version:         fields.version?.trim() || null,
        description:     fields.description?.trim() || null,
        installParams:   fields.installParams?.trim() || null,
        uninstallParams: fields.uninstallParams?.trim() || null,
        wingetId:        fields.wingetId?.trim() || null,
        type:            filePath ? "file" : (fields.type ?? "winget"),
        fileName,
        fileData:        filePath ? `__path__${filePath}` : null,
        fileMimeType:    fileMime,
      },
    });

    return NextResponse.json({ ok: true, id: pkg.id });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: `Upload fehlgeschlagen: ${String(err)}` }, { status: 500 });
  }
}
