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
  const { host, port, bindDn, baseDn, userFilter, searchUser } = body;
  let { bindPassword } = body;

  if (!host || !bindDn || !baseDn) {
    return NextResponse.json({ ok: false, error: "Host, Bind DN und Base DN erforderlich" });
  }

  // If password field was left empty, fall back to the saved password in DB
  if (!bindPassword) {
    const saved = await prisma.ldapConfig.findUnique({
      where: { organizationId: user.organizationId },
      select: { bindPassword: true },
    });
    bindPassword = saved?.bindPassword ?? "";
  }

  try {
    const ldap = await import("ldapjs").catch(() => null);
    if (!ldap) return NextResponse.json({ ok: false, message: "ldapjs nicht verfügbar" });

    type SearchResult = { count: number; samples: string[]; err?: string };

    const result = await new Promise<{ ok: boolean; message: string; entries?: number }>((resolve) => {
      const url = `ldap://${host}:${port ?? 389}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any = ldap.createClient({
        url,
        timeout: 8000,
        connectTimeout: 6000,
        referrals: false,
      } as Parameters<typeof ldap.createClient>[0]);

      let resolved = false;
      const done = (val: { ok: boolean; message: string; entries?: number }) => {
        if (resolved) return;
        resolved = true;
        try { client.destroy(); } catch { /* ignore */ }
        resolve(val);
      };

      const timeout = setTimeout(() => {
        done({ ok: false, message: `Timeout (8s) — Server nicht erreichbar: ${url}` });
      }, 9000);
      timeout; // suppress unused warning

      client.on("error", (err: Error) => {
        done({ ok: false, message: `Verbindungsfehler: ${err.message}` });
      });

      // Run one LDAP search, return count + sample names regardless of how it ends.
      const runSearch = (filter: string, searchBase = baseDn): Promise<SearchResult> =>
        new Promise((res) => {
          client.search(
            searchBase,
            { filter, scope: "sub", attributes: ["cn", "displayName", "mail", "sAMAccountName"], sizeLimit: 5 },
            (searchErr: Error | null, sr: any) => {
              if (searchErr) { res({ count: 0, samples: [], err: searchErr.message }); return; }

              let count = 0;
              const samples: string[] = [];

              const getAttr = (entry: any, attr: string): string =>
                (entry?.pojo?.attributes ?? []).find((a: any) => a.type === attr)?.values?.[0] ?? "";

              sr.on("searchReference", () => {});
              sr.on("searchEntry", (entry: any) => {
                count++;
                const name = getAttr(entry, "displayName") || getAttr(entry, "cn");
                if (name && samples.length < 3) samples.push(name);
              });
              // Both error and end resolve — whichever fires first wins
              const finish = (e?: Error) => res({ count, samples, err: e?.message });
              sr.on("error", (e: Error) => finish(e));
              sr.on("end",   () => finish());
            },
          );
        });

      client.on("connect", async () => {
        client.bind(bindDn, bindPassword ?? "", async (bindErr: Error | null) => {
          if (bindErr) {
            done({ ok: false, message: `Bind fehlgeschlagen: ${bindErr.message}` });
            return;
          }

          clearTimeout(timeout);

          // User-specific search if searchUser is provided
          if (searchUser?.trim()) {
            const q = searchUser.trim();
            const escaped = q.replace(/\\/g, "\\5c").replace(/\*/g, "\\2a").replace(/\(/g, "\\28").replace(/\)/g, "\\29");
            // Also try transliterated version
            const trans = q.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
            const userSearchFilter = trans !== q
              ? `(|(sAMAccountName=${escaped})(sAMAccountName=${trans}))`
              : `(sAMAccountName=${escaped})`;

            // Search in loginBaseDn
            const ldapConfig = await prisma.ldapConfig.findUnique({ where: { organizationId: user.organizationId! }, select: { loginBaseDn: true } });
            const searchBases = [baseDn];
            if (ldapConfig?.loginBaseDn && ldapConfig.loginBaseDn !== baseDn) searchBases.push(ldapConfig.loginBaseDn);

            // Detailed search: show DN, UPN, mail for each found user
            type DetailResult = { count: number; details: string[]; err?: string };
            const runDetailSearch = (filter: string, searchBase: string): Promise<DetailResult> =>
              new Promise((res2) => {
                client.search(searchBase, {
                  filter, scope: "sub",
                  attributes: ["cn", "displayName", "mail", "sAMAccountName", "userPrincipalName", "userAccountControl", "pwdLastSet", "lockoutTime"],
                  sizeLimit: 3,
                }, (sErr: Error | null, sr2: any) => {
                  if (sErr) { res2({ count: 0, details: [], err: sErr.message }); return; }
                  let count = 0;
                  const details: string[] = [];
                  const g = (e: any, a: string) => (e?.pojo?.attributes ?? []).find((x: any) => x.type === a)?.values?.[0] ?? "";
                  sr2.on("searchEntry", (entry: any) => {
                    count++;
                    const uac = parseInt(g(entry, "userAccountControl") || "0");
                    const disabled = (uac & 2) !== 0;
                    const pwdLastSet = g(entry, "pwdLastSet");
                    const mustChangePwd = pwdLastSet === "0";
                    const lockoutTime = g(entry, "lockoutTime");
                    const locked = lockoutTime && lockoutTime !== "0";
                    details.push(
                      `DN: ${entry.dn.toString()}` +
                      `\nUPN: ${g(entry, "userPrincipalName") || "(nicht gesetzt)"}` +
                      `\nMail: ${g(entry, "mail") || "(nicht gesetzt)"}` +
                      `\nsAMAccountName: ${g(entry, "sAMAccountName")}` +
                      `\nKonto: ${disabled ? "DEAKTIVIERT ⚠️" : "aktiv"}` +
                      `\nPasswort: ${mustChangePwd ? "MUSS GEÄNDERT WERDEN ⚠️" : "ok"}` +
                      `\nGesperrt: ${locked ? "JA ⚠️" : "nein"}`
                    );
                  });
                  sr2.on("error", (e: Error) => res2({ count, details, err: e.message }));
                  sr2.on("end", () => res2({ count, details }));
                });
              });

            const msgs: string[] = [];
            for (const base of searchBases) {
              const r = await runDetailSearch(userSearchFilter, base);
              if (r.count > 0) {
                msgs.push(`Suche in "${base}": ${r.count} Treffer\n${r.details.join("\n---\n")}`);
              } else {
                msgs.push(`Suche in "${base}": 0 Treffer${r.err ? ` (${r.err})` : ""}`);
              }
            }
            done({ ok: msgs.some((m) => m.includes("1 Treffer") || (m.includes("Treffer") && !m.includes("0 Treffer"))), message: msgs.join("\n\n") });
            return;
          }

          const primaryFilter  = userFilter?.trim() || "(objectClass=person)";
          const fallbackFilter = "(objectClass=user)";

          const primary = await runSearch(primaryFilter, baseDn);

          if (primary.count > 0) {
            done({
              ok: true,
              message: `Alles korrekt! ${primary.count} Benutzer gefunden.${primary.samples.length ? ` z.B.: ${primary.samples.join(", ")}` : ""}`,
              entries: primary.count,
            });
            return;
          }

          // Primary returned nothing — try fallback filter
          const fallback = await runSearch(fallbackFilter, baseDn);

          if (fallback.count > 0) {
            done({
              ok: true,
              message: `Bind OK ✓ — ${fallback.count} Benutzer mit Filter "${fallbackFilter}" gefunden.${fallback.samples.length ? ` z.B.: ${fallback.samples.join(", ")}` : ""}\n→ Trage "${fallbackFilter}" als User-Filter ein.`,
              entries: fallback.count,
            });
            return;
          }

          done({
            ok: false,
            message: `Bind OK ✓ — Keine Einträge gefunden.\nFilter "${primaryFilter}": ${primary.err ?? "0 Einträge"}\nFilter "${fallbackFilter}": ${fallback.err ?? "0 Einträge"}\n→ Prüfe den Base DN "${baseDn}" und die Leserechte des Bind-Users.`,
          });
        });
      });
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, message: `Fehler: ${String(err)}` });
  }
}
