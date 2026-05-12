import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isFullSetup } from "@/lib/features";

export const dynamic = "force-dynamic";

export type EmailCheckEvent =
  | { type: "log"; text: string }
  | { type: "ticket"; number: number; title: string }
  | { type: "done"; found: number }
  | { type: "error"; message: string };

export async function GET() {
  if (!isFullSetup) return new Response("Not available", { status: 404 });

  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true, organizationId: true },
  });
  if (!user?.isAdmin || !user.organizationId) return new Response("Forbidden", { status: 403 });

  const config = await prisma.exchangeConfig.findUnique({
    where: { organizationId: user.organizationId },
  });

  const enc = new TextEncoder();
  const sse = (e: EmailCheckEvent) => enc.encode(`data: ${JSON.stringify(e)}\n\n`);

  const stream = new ReadableStream({
    async start(ctrl) {
      if (!config?.enabled) {
        ctrl.enqueue(sse({ type: "error", message: "Exchange/IMAP nicht konfiguriert oder deaktiviert." }));
        ctrl.close();
        return;
      }

      ctrl.enqueue(sse({ type: "log", text: `Verbinde mit ${config.host}:${config.port} …` }));

      try {
        // Dynamic import to avoid build errors when package is not installed
        const { ImapFlow } = await import("imapflow");
        const { simpleParser } = await import("mailparser");

        const client = new ImapFlow({
          host: config.host,
          port: config.port,
          secure: config.useSSL,
          auth: { user: config.username, pass: config.password },
          logger: false,
          tls: { rejectUnauthorized: false }, // allow self-signed certs for internal Exchange
        });

        await client.connect();
        ctrl.enqueue(sse({ type: "log", text: "Verbindung hergestellt." }));

        const lock = await client.getMailboxLock(config.mailbox);
        let found = 0;

        try {
          // Fetch all unseen messages
          for await (const msg of client.fetch({ seen: false }, { source: true, envelope: true })) {
            try {
              if (!msg.source) continue;
              const parsed = await simpleParser(msg.source);
              const messageId = parsed.messageId ?? `${Date.now()}-${Math.random()}`;
              const subject = parsed.subject ?? "(Kein Betreff)";
              const fromAddr = parsed.from?.value[0]?.address ?? null;
              const fromName = parsed.from?.value[0]?.name ?? null;
              const body = parsed.text ?? parsed.html ?? null;

              // Skip duplicates
              const existing = await prisma.ticket.findFirst({
                where: { emailMessageId: messageId, organizationId: user.organizationId! },
              });
              if (existing) {
                ctrl.enqueue(sse({ type: "log", text: `Übersprungen (Duplikat): ${subject}` }));
                continue;
              }

              const ticket = await prisma.ticket.create({
                data: {
                  title: subject.slice(0, 200),
                  description: typeof body === "string" ? body.slice(0, 10000) : null,
                  organizationId: user.organizationId!,
                  createdById: session.userId,
                  emailMessageId: messageId,
                  fromEmail: fromAddr,
                  fromName: fromName,
                  priority: "MEDIUM",
                },
              });

              found++;
              ctrl.enqueue(sse({ type: "ticket", number: ticket.number, title: ticket.title }));

              // Mark as seen
              await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]);
            } catch (msgErr) {
              ctrl.enqueue(sse({ type: "log", text: `Fehler bei Nachricht: ${String(msgErr)}` }));
            }
          }
        } finally {
          lock.release();
        }

        await client.logout();

        // Update last checked
        await prisma.exchangeConfig.update({
          where: { organizationId: user.organizationId! },
          data: { lastCheckedAt: new Date() },
        });

        ctrl.enqueue(sse({ type: "done", found }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctrl.enqueue(sse({ type: "error", message: `IMAP-Fehler: ${msg}` }));
      }

      ctrl.close();
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
