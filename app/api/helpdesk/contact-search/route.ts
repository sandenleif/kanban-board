import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) return NextResponse.json([]);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return NextResponse.json([]);

  // 1. Direct LDAP search (if configured) — no Elasticsearch needed
  const ldapConfig = await prisma.ldapConfig.findUnique({
    where: { organizationId: user.organizationId },
    select: { host: true, port: true, bindDn: true, bindPassword: true, baseDn: true, userFilter: true, enabled: true },
  });

  if (ldapConfig?.enabled) {
    const ldapResults = await searchLdap(ldapConfig, q);
    if (ldapResults.length > 0) return NextResponse.json(ldapResults);
  }

  // 2. Search saved contacts
  const contacts = await prisma.ticketContact.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { name:  { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { name: true, email: true, source: true },
    take: 10,
  });
  if (contacts.length > 0) {
    return NextResponse.json(contacts.map((c) => ({ name: c.name, email: c.email ?? "", source: c.source })));
  }

  // 3. Fallback: org users
  const users = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      status: "ACTIVE",
      OR: [
        { name:  { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { name: true, email: true },
    take: 10,
  });

  return NextResponse.json(users.map((u) => ({ name: u.name, email: u.email, source: "manual" })));
}

async function searchLdap(
  config: { host: string; port: number; bindDn: string; bindPassword: string; baseDn: string; userFilter: string },
  q: string
): Promise<{ name: string; email: string; source: string }[]> {
  try {
    const ldap = await import("ldapjs").catch(() => null);
    if (!ldap) return [];

    return await new Promise((resolve) => {
      const client = ldap.createClient({ url: `ldap://${config.host}:${config.port}`, timeout: 6000, connectTimeout: 6000, referrals: false } as Parameters<typeof ldap.createClient>[0]);
      client.on("error", () => resolve([]));

      client.bind(config.bindDn, config.bindPassword, (err) => {
        if (err) { client.destroy(); resolve([]); return; }

        const escaped = q.replace(/[*()\\]/g, "\\$&");
        const filter = `(&${config.userFilter}(|(cn=*${escaped}*)(mail=*${escaped}*)(displayName=*${escaped}*)(sn=*${escaped}*)))`;

        client.search(config.baseDn, {
          filter,
          scope: "sub",
          attributes: ["cn", "displayName", "mail", "sn", "givenName", "telephoneNumber", "mobile", "department", "company", "title", "physicalDeliveryOfficeName"],
          sizeLimit: 10,
        }, (err2, res) => {
          if (err2) { client.destroy(); resolve([]); return; }

          const results: { name: string; email: string; phone: string; mobile: string; department: string; company: string; title: string; source: string }[] = [];

          res.on("searchReference", () => {}); // ignore AD referrals
          res.on("searchEntry", (entry) => {
            const get = (attr: string) =>
              entry.pojo?.attributes?.find((a: { type: string; values: string[] }) => a.type === attr)?.values?.[0] ?? "";

            const name = get("displayName") || get("cn") || `${get("givenName")} ${get("sn")}`.trim();
            const email = get("mail");
            if (name && email) results.push({
              name, email, source: "ad",
              phone: get("telephoneNumber"),
              mobile: get("mobile"),
              department: get("department"),
              company: get("company") || get("physicalDeliveryOfficeName"),
              title: get("title"),
            });
          });

          res.on("end", () => { client.destroy(); resolve(results); });
          res.on("error", () => { client.destroy(); resolve(results); });
        });
      });
    });
  } catch {
    return [];
  }
}
