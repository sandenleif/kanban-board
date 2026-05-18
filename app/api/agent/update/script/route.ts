// Serves the current agent.ps1 to already-registered agents for self-update
// GET /api/agent/update/script
// Auth: Authorization: Bearer <apiKey>

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const SCRIPT_PATH = join(process.cwd(), "scripts", "agent.ps1");

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const apiKey = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.softwareAgent.findUnique({ where: { apiKey } });
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let script: Buffer;
  try {
    script = await readFile(SCRIPT_PATH);
  } catch {
    return NextResponse.json({ error: "Script not found on server" }, { status: 404 });
  }

  const sha256 = createHash("sha256").update(script).digest("hex");

  return new NextResponse(new Uint8Array(script), {
    headers: {
      "Content-Type":        "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agent.ps1"',
      "Content-Length":      String(script.length),
      "X-Agent-SHA256":      sha256,
    },
  });
}
