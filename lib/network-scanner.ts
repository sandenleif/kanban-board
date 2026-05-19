// Background network scanner — runs every 30 minutes via instrumentation.ts
// Reuses the same fping + nslookup logic as the manual scan API.

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function subnetIps(cidr: string): string[] {
  const [base, prefix] = cidr.split("/");
  const prefixLen = parseInt(prefix);
  if (prefixLen < 16 || prefixLen > 30) return [];
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

async function fpingSubnet(ips: string[]): Promise<Map<string, number>> {
  const alive = new Map<string, number>();
  if (ips.length === 0) return alive;
  try {
    const { stdout, stderr } = await execAsync(
      `fping -c 1 -t 500 -e -q ${ips.join(" ")}`,
      { timeout: 120000, maxBuffer: 1024 * 1024 }
    );
    for (const line of (stdout + stderr).split("\n")) {
      const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s*:.*?(\d+(?:\.\d+)?)\s*ms/);
      if (m) alive.set(m[1], parseFloat(m[2]));
    }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    for (const line of ((e.stdout ?? "") + (e.stderr ?? "")).split("\n")) {
      const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s*:.*?(\d+(?:\.\d+)?)\s*ms/);
      if (m) alive.set(m[1], parseFloat(m[2]));
    }
  }
  return alive;
}

async function reverseLookup(ip: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`nslookup ${ip}`, { timeout: 3000 });
    const m = stdout.match(/name\s*=\s*([^\s]+)/i);
    return m ? m[1].replace(/\.$/, "") : null;
  } catch { return null; }
}

export async function scanVlan(vlanId: string): Promise<{ activeCount: number; totalPinged: number }> {
  // Dynamic import to avoid circular deps at module load time
  const { prisma } = await import("./prisma");

  const vlan = await prisma.networkVlan.findUnique({ where: { id: vlanId } });
  if (!vlan) return { activeCount: 0, totalPinged: 0 };

  const ips = subnetIps(vlan.subnet);
  if (ips.length === 0 || ips.length > 1022) return { activeCount: 0, totalPinged: 0 };

  const aliveMap = await fpingSubnet(ips);
  const aliveIps = [...aliveMap.keys()];
  const hostnameResults = await Promise.all(aliveIps.map(reverseLookup));
  const hostnameMap = new Map(aliveIps.map((ip, i) => [ip, hostnameResults[i]]));

  const results = ips.map((ip) => ({
    ip, alive: aliveMap.has(ip),
    hostname: hostnameMap.get(ip) ?? null,
    latencyMs: aliveMap.get(ip) ?? null,
  }));

  await prisma.networkScan.create({
    data: { vlanId, activeCount: aliveMap.size, totalPinged: ips.length, results },
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

  return { activeCount: aliveMap.size, totalPinged: ips.length };
}

async function scanAllVlans() {
  const { prisma } = await import("./prisma");
  const vlans = await prisma.networkVlan.findMany({ select: { id: true, name: true, subnet: true } });
  if (vlans.length === 0) return;

  console.log(`[NetworkScanner] Starte automatischen Scan von ${vlans.length} VLANs…`);
  for (const vlan of vlans) {
    try {
      const r = await scanVlan(vlan.id);
      console.log(`[NetworkScanner] ${vlan.name} (${vlan.subnet}): ${r.activeCount}/${r.totalPinged} aktiv`);
    } catch (err) {
      console.error(`[NetworkScanner] Fehler bei ${vlan.name}: ${err}`);
    }
    // Small delay between subnets to avoid network saturation
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`[NetworkScanner] Scan abgeschlossen.`);
}

const INTERVAL_MS = 30 * 60 * 1000; // 30 Minuten
const STARTUP_DELAY_MS = 3 * 60 * 1000; // 3 Minuten nach Start warten

export function startNetworkScanner() {
  console.log(`[NetworkScanner] Gestartet — erster Scan in 3 Min, danach alle 30 Min.`);

  setTimeout(async () => {
    await scanAllVlans();
    setInterval(scanAllVlans, INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
