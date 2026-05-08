import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";
import path from "path";

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

  const TOTAL_STEPS = 4;

  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(sse({ type: "step", step: 1, total: TOTAL_STEPS, label: "Verbinde mit Datenbank …" }));

      const prismaIndex = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");

      const child = spawn(
        process.execPath,
        [prismaIndex, "db", "push", "--skip-generate", "--accept-data-loss"],
        { env: process.env, cwd: process.cwd() }
      );

      let stepSent = 1;
      const advance = (step: number, label: string) => {
        if (step > stepSent) {
          stepSent = step;
          ctrl.enqueue(sse({ type: "step", step, total: TOTAL_STEPS, label }));
        }
      };

      const handleOutput = (raw: string) => {
        const lines = raw.replace(/\r\n/g, "\n").split("\n");
        for (const line of lines) {
          const text = line.trim();
          if (!text) continue;
          ctrl.enqueue(sse({ type: "log", text }));

          if (/schema loaded/i.test(text)) advance(2, "Schema eingelesen …");
          if (/datasource/i.test(text))    advance(2, "Schema eingelesen …");
          if (/migration|alter|creat|drop/i.test(text)) advance(3, "Änderungen werden angewendet …");
          if (/in sync|done in/i.test(text)) advance(4, "Abgeschlossen");
        }
      };

      child.stdout.on("data", (d: Buffer) => handleOutput(d.toString()));
      child.stderr.on("data", (d: Buffer) => handleOutput(d.toString()));

      child.on("close", (code) => {
        if (code === 0) {
          ctrl.enqueue(sse({ type: "step", step: TOTAL_STEPS, total: TOTAL_STEPS, label: "Fertig" }));
          ctrl.enqueue(sse({ type: "done", message: "Datenbank erfolgreich aktualisiert." }));
        } else {
          ctrl.enqueue(sse({ type: "error", message: `Prozess beendet mit Code ${code}` }));
        }
        ctrl.close();
      });

      child.on("error", (err) => {
        ctrl.enqueue(sse({ type: "error", message: err.message }));
        ctrl.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
