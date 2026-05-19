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
  let created = 0; let updated = 0;

  // Deduplicate names: if same name appears multiple times, append subnet suffix
  const nameCounts = new Map<string, number>();
  vlans.forEach((v) => nameCounts.set(v.name, (nameCounts.get(v.name) ?? 0) + 1));

  for (const v of vlans) {
    const baseName = v.name.trim() || v.subnet;
    // Make name unique if duplicated: "Pforzheim" + " (172.29.21)"
    const name = (nameCounts.get(v.name) ?? 0) > 1
      ? `${baseName} (${v.subnet.split("/")[0].split(".").slice(0, 3).join(".")})`
      : baseName;

    try {
      await prisma.networkVlan.upsert({
        where:  { organizationId_subnet: { organizationId: orgId, subnet: v.subnet.trim() } },
        create: { organizationId: orgId, name, subnet: v.subnet.trim(), description: v.description ?? null },
        update: { name, description: v.description ?? null },
      });
      created++;
    } catch { updated++; }
  }
  return { created, skipped: 0, updated };
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

  // Build Configuration NC base from domain baseDn
  // e.g. DC=intern,DC=siloah,DC=de → CN=Configuration,DC=intern,DC=siloah,DC=de
  const configBase = `CN=Configuration,${ldapConfig.baseDn}`;

  type RawEntry = { cidr: string; name: string };

  const ldapSearch = (base: string, filter: string, attrs: string[]): Promise<{ entries: any[]; error?: string }> =>
    new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any = ldap.createClient({
        url: `ldap://${ldapConfig.host}:${ldapConfig.port}`,
        timeout: 10000, connectTimeout: 8000, referrals: false,
      } as Parameters<typeof ldap.createClient>[0]);

      client.on("error", (e: Error) => resolve({ entries: [], error: e.message }));
      client.bind(ldapConfig.bindDn, ldapConfig.bindPassword, (bindErr: Error | null) => {
        if (bindErr) { client.destroy(); resolve({ entries: [], error: `Bind: ${bindErr.message}` }); return; }

        client.search(base, { filter, scope: "sub", attributes: attrs, sizeLimit: 500 },
          (searchErr: Error | null, res: any) => {
            if (searchErr) { client.destroy(); resolve({ entries: [], error: searchErr.message }); return; }
            const entries: any[] = [];
            res.on("searchReference", () => {});
            res.on("searchEntry", (e: any) => entries.push(e));
            res.on("error", (e: Error) => { client.destroy(); resolve({ entries, error: e.message }); });
            res.on("end", () => { client.destroy(); resolve({ entries }); });
          });
      });
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (entry: any, attr: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry.pojo?.attributes ?? []).find((a: any) => a.type === attr)?.values?.[0] ?? "";

  // ── Strategy 1: AD Sites and Subnets (most reliable, always populated) ──────
  // CN=Subnets,CN=Sites,CN=Configuration,DC=...
  const sitesBase = `CN=Subnets,CN=Sites,${configBase}`;
  const { entries: subnetEntries } = await ldapSearch(
    sitesBase,
    "(objectClass=subnet)",
    ["cn", "description", "location", "siteObject"]
  );

  if (subnetEntries.length > 0) {
    const vlans: RawEntry[] = subnetEntries
      .map((e) => {
        const cidr = get(e, "cn"); // already in CIDR format e.g. "172.29.13.0/24"
        const name = get(e, "description") || get(e, "location") || cidr;
        return { cidr, name };
      })
      .filter((v) => cidrValid(v.cidr));

    const { created, skipped } = await upsertVlans(user.organizationId!, vlans.map((v) => ({ name: v.name.trim() || v.cidr, subnet: v.cidr })));
    return NextResponse.json({ ok: true, created, skipped, total: vlans.length, source: "AD Sites & Subnets" });
  }

  // ── Strategy 2: DHCP scopes in AD (only if AD-integrated DHCP) ───────────────
  const dhcpBase = `CN=DhcpRoot,CN=System,${ldapConfig.baseDn}`;
  const { entries: dhcpEntries } = await ldapSearch(
    dhcpBase,
    "(objectClass=dhcpSubnet)",
    ["cn", "dhcpMask", "name", "description"]
  );

  if (dhcpEntries.length > 0) {
    const vlans = dhcpEntries
      .map((e) => {
        const subnet = get(e, "cn");
        const mask   = get(e, "dhcpMask");
        const name   = get(e, "name") || get(e, "description") || subnet;
        const prefix = maskToCidr(mask);
        return { name: name.trim(), subnet: `${subnet}/${prefix}` };
      })
      .filter((v) => cidrValid(v.subnet));

    const { created, skipped } = await upsertVlans(user.organizationId!, vlans);
    return NextResponse.json({ ok: true, created, skipped, total: vlans.length, source: "AD DHCP" });
  }

  return NextResponse.json({
    error: "Keine Subnetze in AD gefunden (weder Sites & Subnets noch DHCP). Nutze 'Aus Agent-IPs' oder manuell.",
    hint: "text",
  }, { status: 404 });
}
