import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

export type ImportEvent =
  | { type: "log"; text: string }
  | { type: "done"; message: string }
  | { type: "error"; message: string };

// SSE GET: just checks connectivity — actual import is POST
export async function GET() {
  return new Response("Use POST with multipart/form-data", { status: 405 });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) return new Response("Forbidden", { status: 403 });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return new Response("DATABASE_URL not set", { status: 500 });

  let sqlText: string;
  try {
    const form = await req.formData();
    const file = form.get("sql") as File | null;
    if (!file) return new Response("No file", { status: 400 });
    if (file.size > 100 * 1024 * 1024) return new Response("File too large (max 100 MB)", { status: 413 });
    sqlText = await file.text();
  } catch {
    return new Response("Failed to read file", { status: 400 });
  }

  let pgArgs: string[];
  let pgPassword: string;
  try {
    const url = new URL(dbUrl);
    pgPassword = url.password;
    pgArgs = [
      "-h", url.hostname,
      "-p", url.port || "5432",
      "-U", url.username,
      "-d", url.pathname.slice(1),
      "--no-password",
      "-v", "ON_ERROR_STOP=0",
    ];
  } catch {
    return new Response("Could not parse DATABASE_URL", { status: 500 });
  }

  const enc = new TextEncoder();
  const sse = (e: ImportEvent) => enc.encode(`data: ${JSON.stringify(e)}\n\n`);

  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(sse({ type: "log", text: "Starte Import …" }));

      const child = spawn("psql", pgArgs, {
        env: { ...process.env, PGPASSWORD: pgPassword },
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Feed SQL via stdin
      child.stdin.write(sqlText, "utf8");
      child.stdin.end();

      child.stdout.on("data", (d: Buffer) => {
        d.toString().split("\n").forEach((l) => {
          if (l.trim()) ctrl.enqueue(sse({ type: "log", text: l.trim() }));
        });
      });
      child.stderr.on("data", (d: Buffer) => {
        d.toString().split("\n").forEach((l) => {
          if (l.trim()) ctrl.enqueue(sse({ type: "log", text: l.trim() }));
        });
      });

      child.on("close", (code) => {
        if (code === 0 || code === null) {
          ctrl.enqueue(sse({ type: "done", message: "Import abgeschlossen." }));
        } else {
          ctrl.enqueue(sse({ type: "error", message: `psql beendet mit Code ${code}` }));
        }
        ctrl.close();
      });

      child.on("error", (err) => {
        ctrl.enqueue(sse({ type: "error", message: `Spawn-Fehler: ${err.message}` }));
        ctrl.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
