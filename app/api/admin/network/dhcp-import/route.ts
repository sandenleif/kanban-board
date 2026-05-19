// Import DHCP scopes from Active Directory as VLANs
// POST /api/admin/network/dhcp-import

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function maskToCidr(mask: string): number {
  return mask.split(".").reduce((bits, oct) => {
    let n = parseInt(oct);
    let count = 0;
    while (n) { count += n & 1; n >>= 1; }
    return bits + count;
  }, 0);
}

export async function POST(req: NextRequest) {
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

    // DHCP scopes live under CN=DhcpRoot,CN=System,<baseDn>
    const dhcpBase = `CN=DhcpRoot,CN=System,${ldapConfig.baseDn}`;

    type Scope = { subnet: string; mask: string; name: string };

    const scopes = await new Promise<Scope[]>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any = ldap.createClient({
        url: `ldap://${ldapConfig.host}:${ldapConfig.port}`,
        timeout: 10000, connectTimeout: 8000, referrals: false,
      } as Parameters<typeof ldap.createClient>[0]);

      client.on("error", reject);
      client.bind(ldapConfig.bindDn, ldapConfig.bindPassword, (bindErr: Error | null) => {
        if (bindErr) { client.destroy(); reject(bindErr); return; }

        client.search(dhcpBase, {
          filter: "(objectClass=dhcpSubnet)",
          scope: "sub",
          attributes: ["cn", "dhcpMask", "name", "description"],
          sizeLimit: 500,
        }, (searchErr: Error | null, res: any) => {
          if (searchErr) { client.destroy(); reject(searchErr); return; }

          const results: Scope[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const get = (e: any, a: string) => (e.pojo?.attributes ?? []).find((x: any) => x.type === a)?.values?.[0] ?? "";

          res.on("searchReference", () => {});
          res.on("searchEntry", (entry: any) => {
            const subnet = get(entry, "cn");
            const mask   = get(entry, "dhcpMask");
            const name   = get(entry, "name") || get(entry, "description") || subnet;
            if (subnet && mask) results.push({ subnet, mask, name });
          });
          res.on("error", (e: Error) => { client.destroy(); reject(e); });
          res.on("end",   () => { client.destroy(); resolve(results); });
        });
      });
    });

    if (scopes.length === 0) {
      return NextResponse.json({ error: "Keine DHCP-Scopes gefunden. Prüfe ob der Bind-User Lesezugriff auf CN=DhcpRoot,CN=System hat." }, { status: 404 });
    }

    let created = 0; let skipped = 0;
    for (const scope of scopes) {
      const prefix = maskToCidr(scope.mask);
      if (prefix === 0) { skipped++; continue; }
      const cidr = `${scope.subnet}/${prefix}`;
      try {
        await prisma.networkVlan.create({
          data: {
            organizationId: user.organizationId!,
            name: scope.name.trim() || scope.subnet,
            subnet: cidr,
            description: `Importiert aus DHCP (${scope.subnet})`,
          },
        });
        created++;
      } catch {
        skipped++; // already exists or duplicate
      }
    }

    return NextResponse.json({ ok: true, created, skipped, total: scopes.length });
  } catch (err) {
    return NextResponse.json({ error: `DHCP-Import fehlgeschlagen: ${String(err)}` }, { status: 500 });
  }
}
