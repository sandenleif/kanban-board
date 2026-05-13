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

      let resolved = false;
      const done = (val: { ok: boolean; message: string; entries?: number }) => {
        if (resolved) return;
        resolved = true;
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

          // Directly search users — skip base DN verification (AD often blocks scope:base on root)
          const filter = userFilter?.trim() || "(objectClass=person)";
          client.search(baseDn, {
            filter,
            scope: "sub",
            attributes: ["cn", "displayName", "mail", "sAMAccountName"],
            sizeLimit: 5,
          }, (searchErr, res) => {
            if (searchErr) {
              // Try alternative filter for AD (objectClass=user instead of person)
              const altFilter = "(objectClass=user)";
              client.search(baseDn, {
                filter: altFilter,
                scope: "sub",
                attributes: ["cn", "displayName", "mail"],
                sizeLimit: 5,
              }, (e2, r2) => {
                if (e2) {
                  done({
                    ok: false,
                    message: `Bind OK ✓ — Suche fehlgeschlagen.\nFilter "${filter}": ${searchErr.message}\nFilter "${altFilter}": ${e2.message}\n→ Prüfe Base DN und Leserechte des Bind-Users.`,
                  });
                  return;
                }
                let count = 0;
                const samples: string[] = [];
                r2.on("searchEntry", (entry) => {
                  count++;
                  const get = (a: string) =>
                    (entry.pojo?.attributes as { type: string; values: string[] }[] | undefined)
                      ?.find((x) => x.type === a)?.values?.[0] ?? "";
                  const name = get("displayName") || get("cn");
                  if (name && samples.length < 3) samples.push(name);
                });
                r2.on("error", (e: Error) => done({ ok: false, message: `Suche Fehler: ${e.message}` }));
                r2.on("end", () => {
                  if (count === 0) {
                    done({ ok: false, message: `Bind OK ✓ — Mit Filter "${altFilter}" gefunden: 0 Einträge. Prüfe den Base DN "${baseDn}".` });
                  } else {
                    done({ ok: true, message: `OK! Filter "(objectClass=user)" funktioniert. ${count} Benutzer.${samples.length ? ` z.B.: ${samples.join(", ")}` : ""} → Trage "(objectClass=user)" als User-Filter ein.`, entries: count });
                  }
                });
              });
              return;
            }

            let count = 0;
            const samples: string[] = [];
            res.on("searchEntry", (entry) => {
              count++;
              const get = (a: string) =>
                (entry.pojo?.attributes as { type: string; values: string[] }[] | undefined)
                  ?.find((x) => x.type === a)?.values?.[0] ?? "";
              const name = get("displayName") || get("cn");
              if (name && samples.length < 3) samples.push(name);
            });
            res.on("error", (e: Error) => done({ ok: false, message: `Suche Fehler: ${e.message}` }));
            res.on("end", () => {
              if (count === 0) {
                done({ ok: false, message: `Bind OK ✓ — Keine Einträge mit Filter "${filter}". Tipp: Versuche "(objectClass=user)" für Active Directory.` });
              } else {
                done({ ok: true, message: `Alles korrekt! ${count} Benutzer gefunden.${samples.length ? ` z.B.: ${samples.join(", ")}` : ""}`, entries: count });
              }
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
