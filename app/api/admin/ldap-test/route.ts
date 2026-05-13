import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Nicht angemeldet" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.isAdmin || !user.organizationId) {
    return NextResponse.json({ ok: false, error: "Kein Admin" }, { status: 403 });
  }

  const body = await req.json();
  const { host, port, bindDn, bindPassword, baseDn, userFilter } = body;

  if (!host || !bindDn || !baseDn) {
    return NextResponse.json({ ok: false, error: "Host, Bind DN und Base DN erforderlich" });
  }

  try {
    const ldap = await import("ldapjs").catch(() => null);
    if (!ldap) return NextResponse.json({ ok: false, error: "ldapjs nicht verfügbar" });

    const result = await new Promise<{ ok: boolean; message: string; entries?: number }>((resolve) => {
      const url = `ldap://${host}:${port ?? 389}`;
      const client = ldap.createClient({
        url,
        timeout: 8000,
        connectTimeout: 6000,
      });

      const timeout = setTimeout(() => {
        client.destroy();
        resolve({ ok: false, message: `Timeout nach 8s — Server nicht erreichbar unter ${url}` });
      }, 9000);

      client.on("error", (err: Error) => {
        clearTimeout(timeout);
        resolve({ ok: false, message: `Verbindungsfehler: ${err.message}` });
      });

      client.on("connect", () => {
        // Bind with service account
        client.bind(bindDn, bindPassword ?? "", (bindErr) => {
          if (bindErr) {
            clearTimeout(timeout);
            client.destroy();
            resolve({ ok: false, message: `Bind fehlgeschlagen: ${bindErr.message}` });
            return;
          }

          // Try a test search
          const filter = userFilter ?? "(objectClass=person)";
          client.search(baseDn, {
            filter,
            scope: "sub",
            attributes: ["cn", "mail"],
            sizeLimit: 5,
            timeLimit: 5,
          }, (searchErr, res) => {
            if (searchErr) {
              clearTimeout(timeout);
              client.destroy();
              resolve({ ok: false, message: `Bind OK, aber Suche fehlgeschlagen: ${searchErr.message}` });
              return;
            }

            let count = 0;
            res.on("searchEntry", () => count++);
            res.on("error", (e: Error) => {
              clearTimeout(timeout);
              client.destroy();
              resolve({ ok: false, message: `Suche Fehler: ${e.message}` });
            });
            res.on("end", () => {
              clearTimeout(timeout);
              client.destroy();
              resolve({
                ok: true,
                message: `Verbindung erfolgreich! Bind-DN korrekt. ${count} Einträge gefunden (max 5 angezeigt).`,
                entries: count,
              });
            });
          });
        });
      });
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, message: `Unbekannter Fehler: ${String(err)}` });
  }
}
