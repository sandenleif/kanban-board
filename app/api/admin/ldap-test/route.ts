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
    if (!ldap) return NextResponse.json({ ok: false, message: "ldapjs nicht verfügbar" });

    const result = await new Promise<{ ok: boolean; message: string; entries?: number }>((resolve) => {
      const url = `ldap://${host}:${port ?? 389}`;
      const client = ldap.createClient({ url, timeout: 8000, connectTimeout: 6000 });

      const done = (val: { ok: boolean; message: string; entries?: number }) => {
        clearTimeout(timeoutId);
        try { client.destroy(); } catch { /* ignore */ }
        resolve(val);
      };

      const timeoutId = setTimeout(() => {
        done({ ok: false, message: `Timeout (8s) — Server nicht erreichbar: ${url}` });
      }, 9000);

      client.on("error", (err: Error) => {
        done({ ok: false, message: `Verbindungsfehler: ${err.message}` });
      });

      client.on("connect", () => {
        client.bind(bindDn, bindPassword ?? "", (bindErr) => {
          if (bindErr) {
            done({ ok: false, message: `Bind fehlgeschlagen: ${bindErr.message}` });
            return;
          }

          // Step 1: verify baseDn exists
          client.search(baseDn, { filter: "(objectClass=*)", scope: "base", attributes: ["dn"], sizeLimit: 1 }, (e1, r1) => {
            if (e1) {
              done({ ok: false, message: `Bind OK ✓ — Base DN ungültig: "${baseDn}" → ${e1.message}` });
              return;
            }
            let baseDnOk = false;
            r1.on("searchEntry", () => { baseDnOk = true; });
            r1.on("error", (e: Error) => done({ ok: false, message: `Base DN Fehler: ${e.message}` }));
            r1.on("end", () => {
              if (!baseDnOk) {
                done({ ok: false, message: `Bind OK ✓ — Base DN nicht gefunden: "${baseDn}"` });
                return;
              }

              // Step 2: try user search with configured filter
              const filter = userFilter?.trim() || "(objectClass=person)";
              client.search(baseDn, { filter, scope: "sub", attributes: ["cn", "displayName", "mail"], sizeLimit: 5 }, (e2, r2) => {
                if (e2) {
                  // Retry with simpler filter
                  done({
                    ok: false,
                    message: `Bind OK ✓  Base DN OK ✓ — Suche fehlgeschlagen mit Filter "${filter}": ${e2.message}. Tipp: Versuche Filter "(objectClass=user)" oder "(objectClass=*)"`,
                  });
                  return;
                }
                let count = 0;
                const samples: string[] = [];
                r2.on("searchEntry", (entry) => {
                  count++;
                  const get = (attr: string) =>
                    (entry.pojo?.attributes as { type: string; values: string[] }[] | undefined)
                      ?.find((a) => a.type === attr)?.values?.[0] ?? "";
                  const name = get("displayName") || get("cn");
                  if (name && samples.length < 3) samples.push(name);
                });
                r2.on("error", (e: Error) => {
                  done({ ok: false, message: `Bind OK ✓  Base DN OK ✓ — Suche Fehler: ${e.message}` });
                });
                r2.on("end", () => {
                  if (count === 0) {
                    done({
                      ok: false,
                      message: `Bind OK ✓  Base DN OK ✓ — Keine Einträge mit Filter "${filter}" gefunden. Prüfe den Filter oder die Leserechte des Bind-Users.`,
                    });
                  } else {
                    done({
                      ok: true,
                      message: `Alles korrekt! ${count} Benutzer gefunden.${samples.length ? ` Beispiele: ${samples.join(", ")}` : ""}`,
                      entries: count,
                    });
                  }
                });
              });
            });
          });
        });
      });
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, message: `Fehler: ${String(err)}` });
  }
}
