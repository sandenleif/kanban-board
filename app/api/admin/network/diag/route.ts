// Network diagnostics: ping, nslookup, traceroute — server-side execution
// POST /api/admin/network/diag
// Body: { host: string, command: "ping" | "nslookup" | "traceroute" }

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const execAsync = promisify(exec);

// Strict host validation — only allow hostnames and IPs, no shell injection
function sanitizeHost(host: string): string | null {
  const clean = host.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.\-]{0,253}[a-z0-9]$/.test(clean) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) {
    return null;
  }
  return clean;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { host, command } = await req.json();
  const safeHost = sanitizeHost(host ?? "");
  if (!safeHost) return NextResponse.json({ error: "Ungültiger Hostname oder IP" }, { status: 400 });

  const cmds: Record<string, { cmd: string; timeout: number }> = {
    ping:       { cmd: `ping -c 4 -W 2 ${safeHost}`,             timeout: 15000 },
    nslookup:   { cmd: `nslookup ${safeHost}`,                    timeout: 8000  },
    traceroute: { cmd: `traceroute -m 15 -w 1 ${safeHost}`,       timeout: 30000 },
  };

  const spec = cmds[command];
  if (!spec) return NextResponse.json({ error: "Unbekannter Befehl" }, { status: 400 });

  try {
    const { stdout, stderr } = await execAsync(spec.cmd, {
      timeout: spec.timeout,
      maxBuffer: 1024 * 64,
    });
    return NextResponse.json({ ok: true, output: (stdout + stderr).trim() });
  } catch (err: unknown) {
    // Exit code != 0 (e.g. host unreachable) still returns useful output
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = (((e.stdout ?? "") + (e.stderr ?? "")).trim()) || (e.message ?? "Fehler");
    return NextResponse.json({ ok: false, output });
  }
}
