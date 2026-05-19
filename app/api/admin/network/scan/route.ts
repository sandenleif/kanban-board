// Scan a VLAN subnet: ping all IPs with fping, nslookup on live hosts
// POST /api/admin/network/scan  body: { vlanId }

import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const execAsync = promisify(exec);

type ScanResult = { ip: string; alive: boolean; hostname: string | null; latencyMs: number | null };

// Generate all usable host IPs for a CIDR subnet
function subnetIps(cidr: string): string[] {
  const [base, prefix] = cidr.split("/");
  const prefixLen = parseInt(prefix);
  if (prefixLen < 16 || prefixLen > 30) return []; // safety: don't scan huge ranges
  const parts = base.split(".").map(Number);
  const baseNum = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  const size = 2 ** (32 - prefixLen);
  const ips: string[] = [];
  for (let i = 1; i < size - 1; i++) {
    const n = (baseNum & ~(size - 1)) + i;
    ips.push([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
  }
  return ips;
}

// Use fping for fast parallel ping of entire subnet
async function fpingSubnet(ips: string[]): Promise<Map<string, number>> {
  const alive = new Map<string, number>();
  if (ips.length === 0) return alive;

  const ipList = ips.join(" ");
  try {
    // fping: -c 1 (1 ping), -t 500 (500ms timeout), -q (quiet stats), -e (show elapsed)
    const { stdout, stderr } = await execAsync(
      `fping -c 1 -t 500 -e -q ${ipList}`,
      { timeout: 60000, maxBuffer: 1024 * 512 }
    );
    const output = stdout + stderr;
    // Parse fping output: "172.29.13.1 : [0], 64 bytes, 0.21 ms"
    for (const line of output.split("\n")) {
      const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s*:.*?(\d+(?:\.\d+)?)\s*ms/);
      if (m) alive.set(m[1], parseFloat(m[2]));
    }
  } catch (err: unknown) {
    // fping exits non-zero when some hosts are unreachable — parse anyway
    const e = err as { stdout?: string; stderr?: string };
    const output = (e.stdout ?? "") + (e.stderr ?? "");
    for (const line of output.split("\n")) {
      const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s*:.*?(\d+(?:\.\d+)?)\s*ms/);
      if (m) alive.set(m[1], parseFloat(m[2]));
    }
  }
  return alive;
}

// nslookup for a single IP
async function reverseLookup(ip: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`nslookup ${ip}`, { timeout: 3000 });
    const m = stdout.match(/name\s*=\s*([^\s]+)/i);
    return m ? m[1].replace(/\.$/, "") : null;
  } catch { return null; }
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

  const { vlanId } = await req.json();
  if (!vlanId) return NextResponse.json({ error: "vlanId erforderlich" }, { status: 400 });

  const vlan = await prisma.networkVlan.findFirst({
    where: { id: vlanId, organizationId: user.organizationId },
  });
  if (!vlan) return NextResponse.json({ error: "VLAN nicht gefunden" }, { status: 404 });

  const ips = subnetIps(vlan.subnet);
  if (ips.length === 0) {
    return NextResponse.json({ error: `Subnet ${vlan.subnet} zu groß oder ungültig (max /16)` }, { status: 400 });
  }
  if (ips.length > 1022) {
    return NextResponse.json({ error: "Subnet zu groß (max /22 = 1022 IPs)" }, { status: 400 });
  }

  // Ping entire subnet
  const aliveMap = await fpingSubnet(ips);

  // Resolve hostnames for alive hosts (parallel, capped)
  const aliveIps = [...aliveMap.keys()];
  const hostnameResults = await Promise.all(
    aliveIps.map((ip) => reverseLookup(ip))
  );
  const hostnameMap = new Map(aliveIps.map((ip, i) => [ip, hostnameResults[i]]));

  // Build results array
  const results: ScanResult[] = ips.map((ip) => ({
    ip,
    alive: aliveMap.has(ip),
    hostname: hostnameMap.get(ip) ?? null,
    latencyMs: aliveMap.get(ip) ?? null,
  }));

  const activeCount = aliveMap.size;

  // Save scan (keep last 5 scans per VLAN)
  const scan = await prisma.networkScan.create({
    data: { vlanId, activeCount, totalPinged: ips.length, results },
  });

  const old = await prisma.networkScan.findMany({
    where: { vlanId },
    orderBy: { scannedAt: "desc" },
    skip: 5,
    select: { id: true },
  });
  if (old.length > 0) {
    await prisma.networkScan.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }

  return NextResponse.json({
    ok: true,
    scanId: scan.id,
    activeCount,
    totalPinged: ips.length,
    subnet: vlan.subnet,
  });
}
