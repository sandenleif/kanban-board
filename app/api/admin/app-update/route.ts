import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type AppUpdateEvent =
  | { type: "step"; step: number; total: number; label: string }
  | { type: "log"; text: string }
  | { type: "restart"; message: string }
  | { type: "no_update"; message: string }
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
      if (!watchtowerUrl) {
        ctrl.enqueue(sse({
          type: "error",
          message:
            "Watchtower ist nicht konfiguriert. " +
            "Starte die App mit docker-compose.standalone.yml, " +
            "damit der Update-Button funktioniert.",
        }));
        ctrl.close();
        return;
      }

      ctrl.enqueue(sse({ type: "step", step: 1, total: TOTAL, label: "Verbinde mit Watchtower …" }));
      ctrl.enqueue(sse({ type: "log", text: `Watchtower-URL: ${watchtowerUrl}` }));

      // Health-check first
      try {
        const health = await fetch(`${watchtowerUrl}/v1/update`, {
          method: "HEAD",
          headers: { Authorization: `Bearer ${watchtowerToken}` },
          signal: AbortSignal.timeout(5_000),
        }).catch(() => null);

        if (!health) {
          ctrl.enqueue(sse({ type: "log", text: "⚠ Watchtower nicht erreichbar – HEAD-Check fehlgeschlagen" }));
        } else {
          ctrl.enqueue(sse({ type: "log", text: `Watchtower erreichbar (HTTP ${health.status})` }));
        }
      } catch { /* ignore HEAD errors */ }

      ctrl.enqueue(sse({ type: "step", step: 2, total: TOTAL, label: "Prüfe und lade neues Image …" }));
      ctrl.enqueue(sse({ type: "log", text: "Starte Watchtower-Update (kann 1–3 Min dauern) …" }));

      try {
        const res = await fetch(`${watchtowerUrl}/v1/update`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${watchtowerToken}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(5 * 60 * 1000),
        });

        const body = await res.text().catch(() => "");
        ctrl.enqueue(sse({ type: "log", text: `Watchtower-Antwort (HTTP ${res.status}): ${body || "(leer)"}` }));

        if (!res.ok) {
          ctrl.enqueue(sse({
            type: "error",
            message: `Watchtower-Fehler HTTP ${res.status}: ${body}. ` +
              "Prüfe ob das GHCR-Image öffentlich ist oder ob GHCR_TOKEN konfiguriert ist.",
          }));
          ctrl.close();
          return;
        }

        // Parse Watchtower response
        // Typical response: {"containers_updated": 1, ...} or just HTTP 200
        let updated = false;
        try {
          const json = JSON.parse(body);
          updated = (json.containers_updated ?? 0) > 0 || (json.Updated ?? 0) > 0;
          ctrl.enqueue(sse({ type: "log", text: `Container aktualisiert: ${updated ? "Ja" : "Nein (kein neues Image)"}` }));
        } catch {
          // Not JSON — treat any 200 as success
          updated = res.ok;
        }

        if (!updated) {
          ctrl.enqueue(sse({
            type: "no_update",
            message:
              "Kein neues Image gefunden. " +
              "Stelle sicher dass GitHub Actions den Build abgeschlossen hat " +
              "und das Image auf GHCR aktualisiert wurde.",
          }));
          ctrl.close();
          return;
        }

        ctrl.enqueue(sse({ type: "step", step: 3, total: TOTAL, label: "Container startet neu …" }));
        ctrl.enqueue(sse({
          type: "restart",
          message: "Neues Image installiert. Container wird neu gestartet …",
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctrl.enqueue(sse({ type: "error", message: `Verbindungsfehler: ${msg}` }));
      }

      ctrl.close();
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
