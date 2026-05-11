import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) return new Response("Forbidden", { status: 403 });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return new Response("DATABASE_URL not set", { status: 500 });

  // Parse connection details from DATABASE_URL
  // postgresql://user:pass@host:port/db
  let pgArgs: string[];
  try {
    const url = new URL(dbUrl);
    pgArgs = [
      "-h", url.hostname,
      "-p", url.port || "5432",
      "-U", url.username,
      "-d", url.pathname.slice(1),
      "--no-password",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
    ];
  } catch {
    return new Response("Could not parse DATABASE_URL", { status: 500 });
  }

  const dbUrl2 = dbUrl; // for env
  const date = new Date().toISOString().slice(0, 10);
  const filename = `kanban-backup-${date}.sql`;

  const stream = new ReadableStream({
    start(ctrl) {
      const child = spawn("pg_dump", pgArgs, {
        env: { ...process.env, PGPASSWORD: new URL(dbUrl2).password },
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (d: Buffer) => ctrl.enqueue(d));
      child.stderr.on("data", (d: Buffer) => {
        // pg_dump writes non-fatal warnings to stderr — include as comments
        const txt = d.toString();
        if (txt.trim()) ctrl.enqueue(new TextEncoder().encode(`-- pg_dump stderr: ${txt}\n`));
      });
      child.on("close", (code) => {
        if (code !== 0) ctrl.enqueue(new TextEncoder().encode(`\n-- ERROR: pg_dump exited with code ${code}\n`));
        ctrl.close();
      });
      child.on("error", (err) => {
        ctrl.enqueue(new TextEncoder().encode(`-- SPAWN ERROR: ${err.message}\n`));
        ctrl.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/sql",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Accel-Buffering": "no",
    },
  });
}
