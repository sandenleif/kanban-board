// Agent polling endpoint — called by PowerShell agent on each PC
// GET  /api/agent/jobs?apiKey=xxx          → pending jobs for this agent
// POST /api/agent/jobs?apiKey=xxx          → report job result

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function resolveAgent(req: NextRequest) {
  const apiKey = req.nextUrl.searchParams.get("apiKey");
  if (!apiKey) return null;
  return prisma.softwareAgent.findUnique({ where: { apiKey } });
}

// GET — agent fetches its pending jobs
export async function GET(req: NextRequest) {
  const agent = await resolveAgent(req);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Update last-seen timestamp + IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null;
  await prisma.softwareAgent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date(), ...(ip ? { ipAddress: ip } : {}) },
  });

  const jobs = await prisma.softwareJob.findMany({
    where: {
      agentId: agent.id,
      status: "PENDING",
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    },
    include: {
      package: {
        select: {
          id: true, name: true, type: true,
          wingetId: true, installParams: true,
          fileName: true, fileMimeType: true,
          // Don't send fileData here — agent fetches separately to avoid huge payloads
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  // Mark fetched jobs as RUNNING
  if (jobs.length > 0) {
    await prisma.softwareJob.updateMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      data: { status: "RUNNING", startedAt: new Date() },
    });
  }

  return NextResponse.json(jobs.map((j) => ({
    jobId:    j.id,
    name:     j.package.name,
    type:     j.package.type,
    wingetId: j.package.wingetId,
    params:   j.package.installParams,
    fileName: j.package.fileName,
    // File download URL if needed
    fileUrl:  j.package.fileName ? `/api/agent/packages/${j.package.id}/download?apiKey=${agent.apiKey}` : null,
  })));
}

// POST — agent reports job result
export async function POST(req: NextRequest) {
  const agent = await resolveAgent(req);
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { jobId, exitCode, log } = body as { jobId: string; exitCode: number; log?: string };

  if (!jobId || exitCode === undefined) {
    return NextResponse.json({ error: "jobId and exitCode required" }, { status: 400 });
  }

  const job = await prisma.softwareJob.findFirst({
    where: { id: jobId, agentId: agent.id },
  });
  // Accept result even if job was already marked complete (agent retry after network failure)
  if (!job) return NextResponse.json({ ok: true, skipped: true });

  await prisma.softwareJob.update({
    where: { id: jobId },
    data: {
      status:      exitCode === 0 ? "SUCCESS" : "FAILED",
      exitCode,
      log:         log ?? null,
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
