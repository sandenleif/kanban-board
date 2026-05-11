import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

export type UpdateEvent =
  | { type: "step"; step: number; total: number; label: string }
  | { type: "log"; text: string }
  | { type: "done"; message: string }
  | { type: "error"; message: string };

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) return new Response("Forbidden", { status: 403 });

  const enc = new TextEncoder();
  const sse = (payload: UpdateEvent) =>
    enc.encode(`data: ${JSON.stringify(payload)}\n\n`);

  const TOTAL = 4;

  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(sse({ type: "step", step: 1, total: TOTAL, label: "Starte Prisma …" }));

      // Try multiple known prisma locations
      const cwd = process.cwd();
      const candidates = [
        path.join(cwd, "node_modules", "prisma", "build", "index.js"),
        path.join(cwd, "node_modules", ".bin", "prisma"),
        "/app/node_modules/prisma/build/index.js",
      ];
      const prismaPath = candidates.find((p) => fs.existsSync(p));

      if (!prismaPath) {
        ctrl.enqueue(sse({ type: "error", message: `Prisma nicht gefunden. Gesucht in: ${candidates.join(", ")}` }));
        ctrl.close();
        return;
      }

      ctrl.enqueue(sse({ type: "log", text: `Prisma: ${prismaPath}` }));
      ctrl.enqueue(sse({ type: "log", text: `CWD: ${cwd}` }));
      ctrl.enqueue(sse({ type: "log", text: `DATABASE_URL: ${process.env.DATABASE_URL ? "✓ gesetzt" : "✗ fehlt!"}` }));

      const args = prismaPath.endsWith("index.js")
        ? [prismaPath, "db", "push", "--skip-generate", "--accept-data-loss"]
        : ["db", "push", "--skip-generate", "--accept-data-loss"];

      const cmd = prismaPath.endsWith("index.js") ? process.execPath : prismaPath;

      const child = spawn(cmd, args, {
        env: { ...process.env },
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stepSent = 1;
      const advance = (step: number, label: string) => {
        if (step > stepSent) {
          stepSent = step;
          ctrl.enqueue(sse({ type: "step", step, total: TOTAL, label }));
        }
      };

      const handleLine = (text: string) => {
        if (!text.trim()) return;
        ctrl.enqueue(sse({ type: "log", text: text.trim() }));
        if (/schema loaded|prisma schema/i.test(text)) advance(2, "Schema eingelesen …");
        if (/datasource|database/i.test(text))         advance(2, "Schema eingelesen …");
        if (/migration|alter|creat|drop|applying/i.test(text)) advance(3, "Änderungen werden angewendet …");
        if (/in sync|done in|already in sync/i.test(text)) advance(4, "Fertig");
      };

      let stdoutBuf = "";
      let stderrBuf = "";

      child.stdout.on("data", (d: Buffer) => {
        stdoutBuf += d.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";
        lines.forEach(handleLine);
      });

      child.stderr.on("data", (d: Buffer) => {
        stderrBuf += d.toString();
        const lines = stderrBuf.split("\n");
        stderrBuf = lines.pop() ?? "";
        lines.forEach(handleLine);
      });

      child.on("close", (code) => {
        if (stdoutBuf.trim()) handleLine(stdoutBuf);
        if (stderrBuf.trim()) handleLine(stderrBuf);

        if (code === 0) {
          ctrl.enqueue(sse({ type: "step", step: TOTAL, total: TOTAL, label: "Fertig" }));
          ctrl.enqueue(sse({ type: "done", message: "Schema erfolgreich aktualisiert." }));
        } else {
          ctrl.enqueue(sse({ type: "error", message: `Prozess beendet mit Exit-Code ${code}` }));
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
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
