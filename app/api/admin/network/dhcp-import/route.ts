// Import DHCP scopes / subnets from AD or plain text
// POST /api/admin/network/dhcp-import
// Body: { mode: "ad" | "text", subnets?: string }
//   mode=ad:   query DHCP scopes from Active Directory
//   mode=text: parse "subnet name" lines (e.g. "172.29.13.0/24 Management")

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function maskToCidr(mask: string): number {
  return mask.split(".").reduce((bits, oct) => {
    let n = parseInt(oct);
    let c = 0;
    while (n) { c += n & 1; n >>>= 1; }
    return bits + c;
  }, 0);
}

function cidrValid(cidr: string) {
  return /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(cidr.trim());
}

async function upsertVlans(orgId: string, vlans: { name: string; subnet: string; description?: string }[]) {
  let created = 0; let skipped = 0;
  for (const v of vlans) {
    try {
      await prisma.networkVlan.create({
        data: { organizationId: orgId, name: v.name.trim(), subnet: v.subnet.trim(), description: v.description ?? null },
      });
      created++;
    } catch { skipped++; }
  }
  return { created, skipped };
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

  const body = await req.json().catch(() => ({}));
  const mode: string = body.mode ?? "ad";

  // ── Text import ─────────────────────────────────────────────────────────────
  if (mode === "text") {
    const lines: string[] = (body.subnets ?? "").split("\n").map((l: string) => l.trim()).filter(Boolean);
    const vlans = [];
    const errors = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const subnet = parts[0];
      const name   = parts.slice(1).join(" ") || subnet;
      if (!cidrValid(subnet)) { errors.push(`Ungültig: "${line}"`); continue; }
      vlans.push({ name, subnet });
    }
    if (vlans.length === 0) return NextResponse.json({ error: `Keine gültigen Subnetze. ${errors.join(", ")}` }, { status: 400 });
    const { created, skipped } = await upsertVlans(user.organizationId!, vlans);
    return NextResponse.json({ ok: true, created, skipped, total: vlans.length });
  }

  // ── AD import ────────────────────────────────────────────────────────────────
  const ldapConfig = await prisma.ldapConfig.findUnique({
    where: { organizationId: user.organizationId },
    select: { host: true, port: true, bindDn: true, bindPassword: true, baseDn: true, enabled: true },
  });
  if (!ldapConfig?.enabled) return NextResponse.json({ error: "LDAP nicht konfiguriert" }, { status: 400 });

  const ldap = await import("ldapjs").catch(() => null);
  if (!ldap) return NextResponse.json({ error: "ldapjs nicht verfügbar" }, { status: 500 });

  // Try multiple search bases where DHCP scopes can live
  const searchBases = [
    `CN=DhcpRoot,CN=System,${ldapConfig.baseDn}`,
    `CN=System,${ldapConfig.baseDn}`,
    ldapConfig.baseDn,
  ];

  type Scope = { subnet: string; mask: string; name: string };

  const trySearch = (base: string): Promise<{ scopes: Scope[]; error?: string }> =>
    new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any = ldap.createClient({
        url: `ldap://${ldapConfig.host}:${ldapConfig.port}`,
        timeout: 10000, connectTimeout: 8000, referrals: false,
      } as Parameters<typeof ldap.createClient>[0]);

      client.on("error", (e: Error) => resolve({ scopes: [], error: e.message }));

      client.bind(ldapConfig.bindDn, ldapConfig.bindPassword, (bindErr: Error | null) => {
        if (bindErr) { client.destroy(); resolve({ scopes: [], error: `Bind: ${bindErr.message}` }); return; }

        client.search(base, {
          filter: "(objectClass=dhcpSubnet)",
          scope: "sub",
          attributes: ["cn", "dhcpMask", "name", "description"],
          sizeLimit: 500,
        }, (searchErr: Error | null, res: any) => {
          if (searchErr) { client.destroy(); resolve({ scopes: [], error: searchErr.message }); return; }

          const scopes: Scope[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const get = (e: any, a: string) => (e.pojo?.attributes ?? []).find((x: any) => x.type === a)?.values?.[0] ?? "";

          res.on("searchReference", () => {});
          res.on("searchEntry", (entry: any) => {
            const subnet = get(entry, "cn");
            const mask   = get(entry, "dhcpMask");
            const name   = get(entry, "name") || get(entry, "description") || subnet;
            if (subnet && mask) scopes.push({ subnet, mask, name });
          });
          res.on("error", (e: Error) => { client.destroy(); resolve({ scopes: [], error: e.message }); });
          res.on("end", () => { client.destroy(); resolve({ scopes }); });
        });
      });
    });

  const triedBases: string[] = [];
  for (const base of searchBases) {
    triedBases.push(base);
    const { scopes, error } = await trySearch(base);
    if (scopes.length > 0) {
      const vlans = scopes
        .map((s) => ({ name: s.name.trim() || s.subnet, subnet: `${s.subnet}/${maskToCidr(s.mask)}` }))
        .filter((v) => cidrValid(v.subnet));

      const { created, skipped } = await upsertVlans(user.organizationId!, vlans);
      return NextResponse.json({ ok: true, created, skipped, total: scopes.length, source: base });
    }
    if (error && !error.includes("No Such Object") && !error.includes("noSuchObject")) {
      return NextResponse.json({ error: `LDAP-Fehler bei "${base}": ${error}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    error: `Keine DHCP-Scopes in AD gefunden.\n\nGesucht in:\n${triedBases.join("\n")}\n\nDein DHCP-Server ist möglicherweise nicht AD-integriert. Nutze stattdessen "Manuell eingeben" und trage die Subnetze direkt ein.`,
    hint: "text",
  }, { status: 404 });
}
