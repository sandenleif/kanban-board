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

  try {
    const ldap = await import("ldapjs").catch(() => null);
    if (!ldap) return NextResponse.json({ error: "ldapjs nicht verfügbar" }, { status: 500 });

    const computers = await new Promise<AdComputer[]>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any = ldap.createClient({
        url: `ldap://${ldapConfig.host}:${ldapConfig.port}`,
        timeout: 10000, connectTimeout: 8000, referrals: false,
      } as Parameters<typeof ldap.createClient>[0]);

      client.on("error", reject);

      client.bind(ldapConfig.bindDn, ldapConfig.bindPassword, (bindErr: Error | null) => {
        if (bindErr) { client.destroy(); reject(bindErr); return; }

        const results: AdComputer[] = [];

        client.search(
          ldapConfig.baseDn,
          {
            filter: "(objectClass=computer)",
            scope: "sub",
            attributes: ["cn", "dNSHostName", "operatingSystem", "lastLogon", "lastLogonTimestamp"],
            sizeLimit: 1000,
            paged: true,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (searchErr: Error | null, res: any) => {
            if (searchErr) { client.destroy(); reject(searchErr); return; }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const get = (entry: any, attr: string) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (entry.pojo?.attributes ?? []).find((a: any) => a.type === attr)?.values?.[0] ?? "";

            // Convert Windows FILETIME (100ns intervals since 1601) to Date
            const fileTimeToDate = (ft: string) => {
              if (!ft || ft === "0" || ft === "9223372036854775807") return "";
              try {
                const ms = (BigInt(ft) - BigInt("116444736000000000")) / BigInt(10000);
                return new Date(Number(ms)).toLocaleDateString("de-DE");
              } catch { return ""; }
            };

            res.on("searchReference", () => {});
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res.on("searchEntry", (entry: any) => {
              const hostname = get(entry, "dNSHostName") || get(entry, "cn");
              if (!hostname) return;
              const lastLogonTs = get(entry, "lastLogonTimestamp") || get(entry, "lastLogon");
              results.push({
                hostname: hostname.toLowerCase(),
                os: get(entry, "operatingSystem") || "Unbekannt",
                lastLogon: fileTimeToDate(lastLogonTs),
              });
            });
            res.on("error", (e: Error) => { client.destroy(); reject(e); });
            res.on("end", () => { client.destroy(); resolve(results); });
          }
        );
      });
    });

    // Merge with agent IPs
    const agents = await prisma.softwareAgent.findMany({
      where: { organizationId: user.organizationId },
      select: { hostname: true, ipAddress: true },
    });
    const agentMap = new Map(agents.map((a) => [a.hostname.toLowerCase(), a.ipAddress]));

    const enriched = computers.map((c) => ({
      ...c,
      ipAddress: agentMap.get(c.hostname.split(".")[0]) ?? agentMap.get(c.hostname) ?? undefined,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    return NextResponse.json({ error: `AD-Scan fehlgeschlagen: ${String(err)}` }, { status: 500 });
  }
}
