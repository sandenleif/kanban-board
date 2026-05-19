// Query AD for all computer objects to populate network view
// GET /api/admin/network/ad-scan

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AdComputer = {
  hostname: string;
  os: string;
  lastLogon: string;
  ipAddress?: string;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.isAdmin || !user.organizationId) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const ldapConfig = await prisma.ldapConfig.findUnique({
    where: { organizationId: user.organizationId },
    select: { host: true, port: true, bindDn: true, bindPassword: true, baseDn: true, enabled: true },
  });

  if (!ldapConfig?.enabled) return NextResponse.json({ error: "LDAP nicht konfiguriert" }, { status: 400 });

  // Convert Windows FILETIME (100ns intervals since 1601-01-01) to date string
  const fileTimeToDate = (ft: string) => {
    if (!ft || ft === "0" || ft === "9223372036854775807") return "";
    try {
      const ms = (BigInt(ft) - BigInt("116444736000000000")) / BigInt(10000);
      return new Date(Number(ms)).toLocaleDateString("de-DE");
    } catch { return ""; }
  };

  try {
    const ldap = await import("ldapjs").catch(() => null);
    if (!ldap) return NextResponse.json({ error: "ldapjs nicht verfügbar" }, { status: 500 });

    const result = await new Promise<{ computers: AdComputer[]; warning?: string }>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any = ldap.createClient({
        url: `ldap://${ldapConfig.host}:${ldapConfig.port}`,
        timeout: 15000, connectTimeout: 8000, referrals: false,
      } as Parameters<typeof ldap.createClient>[0]);

      client.on("error", reject);

      client.bind(ldapConfig.bindDn, ldapConfig.bindPassword, (bindErr: Error | null) => {
        if (bindErr) { client.destroy(); reject(new Error(`Bind fehlgeschlagen: ${bindErr.message}`)); return; }

        const computers: AdComputer[] = [];
        let warning: string | undefined;

        // Use combined filter — more reliable across AD versions
        // No paged:true — causes issues with ldapjs + some AD configs
        client.search(
          ldapConfig.baseDn,
          {
            filter: "(&(objectClass=computer)(objectCategory=computer))",
            scope: "sub",
            attributes: ["cn", "dNSHostName", "operatingSystem", "lastLogonTimestamp", "lastLogon"],
            sizeLimit: 2000,
          },
          (searchErr: Error | null, res: any) => {
            if (searchErr) { client.destroy(); reject(new Error(`Suche fehlgeschlagen: ${searchErr.message}`)); return; }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const get = (entry: any, attr: string) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (entry.pojo?.attributes ?? []).find((a: any) => a.type === attr)?.values?.[0] ?? "";

            res.on("searchReference", () => {});
            res.on("searchEntry", (entry: any) => {
              const hostname = (get(entry, "dNSHostName") || get(entry, "cn") || "").toLowerCase().split(".")[0];
              if (!hostname) return;
              const lastLogon = fileTimeToDate(get(entry, "lastLogonTimestamp") || get(entry, "lastLogon"));
              computers.push({
                hostname,
                os:        get(entry, "operatingSystem") || "Unbekannt",
                lastLogon,
              });
            });
            res.on("error", (e: Error) => {
              // Size limit exceeded = partial results OK, treat as warning not error
              if (e.message?.toLowerCase().includes("size limit") || e.message?.toLowerCase().includes("sizelimitexceeded")) {
                warning = `Ergebnisse abgeschnitten (AD-Limit erreicht): ${computers.length} geladen`;
                client.destroy();
                resolve({ computers, warning });
              } else {
                client.destroy(); reject(e);
              }
            });
            res.on("end", () => { client.destroy(); resolve({ computers, warning }); });
          }
        );
      });
    });

    if (result.computers.length === 0) {
      return NextResponse.json({
        error: `Keine Computer-Objekte gefunden in "${ldapConfig.baseDn}". Prüfe ob der Bind-User Lesezugriff auf Computer-Objekte hat.`,
        hint: "Tipp: Der Bind-User braucht mindestens 'Read' auf die Computer-OU.",
      }, { status: 404 });
    }

    // Merge with agent IPs (hostname matching — strip domain suffix)
    const agents = await prisma.softwareAgent.findMany({
      where: { organizationId: user.organizationId },
      select: { hostname: true, ipAddress: true },
    });
    const agentMap = new Map(agents.map((a) => [a.hostname.toLowerCase().split(".")[0], a.ipAddress]));

    const enriched = result.computers.map((c) => ({
      ...c,
      ipAddress: agentMap.get(c.hostname) ?? undefined,
    }));

    return NextResponse.json({ computers: enriched, warning: result.warning, total: enriched.length });
  } catch (err) {
    return NextResponse.json({ error: `AD-Scan fehlgeschlagen: ${String(err)}` }, { status: 500 });
  }
}
