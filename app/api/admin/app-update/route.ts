import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type AppUpdateEvent =
  | { type: "step"; step: number; total: number; label: string }
  | { type: "log"; text: string }
  | { type: "restart"; message: string }
  | { type: "error"; message: string };

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) return new Response("Forbidden", { status: 403 });

  const watchtowerUrl = process.env.WATCHTOWER_URL ?? "";
  const watchtowerToken = process.env.WATCHTOWER_TOKEN ?? "";

  const enc = new TextEncoder();
  const sse = (payload: AppUpdateEvent) =>
    enc.encode(`data: ${JSON.stringify(payload)}\n\n`);

  const TOTAL = 3;

  const stream = new ReadableStream({
    async start(ctrl) {
      // If Watchtower is not configured, explain it
      if (!watchtowerUrl) {
        ctrl.enqueue(sse({
          type: "error",
          message:
            "Watchtower ist nicht konfiguriert. " +
            "Starte die App mit docker-compose.standalone.yml, damit der Update-Button funktioniert. " +
            "Alternativ: manuell 'docker pull' + Container neustarten.",
        }));
        ctrl.close();
        return;
      }

      ctrl.enqueue(sse({ type: "step", step: 1, total: TOTAL, label: "Verbinde mit Watchtower …" }));
      ctrl.enqueue(sse({ type: "log", text: `Watchtower URL: ${watchtowerUrl}` }));

      try {
        ctrl.enqueue(sse({ type: "step", step: 2, total: TOTAL, label: "Lade neues Image von GitHub …" }));
        ctrl.enqueue(sse({ type: "log", text: "POST /v1/update → Watchtower startet docker pull …" }));
        ctrl.enqueue(sse({ type: "log", text: "Das kann je nach Imagegröße 1–3 Minuten dauern …" }));

        const res = await fetch(`${watchtowerUrl}/v1/update`, {
          method: "POST",
          headers: { Authorization: `Bearer ${watchtowerToken}` },
          signal: AbortSignal.timeout(5 * 60 * 1000), // 5 min
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Watchtower: HTTP ${res.status}${body ? ` – ${body}` : ""}`);
        }

        const body = await res.text().catch(() => "");
        ctrl.enqueue(sse({ type: "log", text: `Watchtower: ${body || "OK"}` }));

        ctrl.enqueue(sse({ type: "step", step: 3, total: TOTAL, label: "Container startet neu …" }));
        ctrl.enqueue(sse({
          type: "restart",
          message: "Neues Image installiert. Container wird jetzt neu gestartet …",
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctrl.enqueue(sse({ type: "error", message: msg }));
      }

      ctrl.close();
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
