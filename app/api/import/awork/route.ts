import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

// Status type → column name mapping
const STATUS_TO_COLUMN: Record<string, string[]> = {
  todo:     ["To Do", "Backlog", "Offen", "Offene Aufgabe"],
  progress: ["In Progress", "In Arbeit", "In Bearbeitung"],
  done:     ["Done", "Erledigt", "Fertig"],
  stuck:    ["Review", "Blocked", "Rückmeldung", "Wartet", "Pausiert"],
};

function findBestColumn(columns: { id: string; name: string }[], statusType: string): string | null {
  const candidates = STATUS_TO_COLUMN[statusType] ?? [];
  for (const cand of candidates) {
    const found = columns.find((c) => c.name.toLowerCase().includes(cand.toLowerCase()));
    if (found) return found.id;
  }
  // Fallback: first column
  return columns[0]?.id ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return NextResponse.json({ error: "No org" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const projectId = form.get("projectId") as string | null;
  const preview = form.get("preview") === "true";

  if (!file) return NextResponse.json({ error: "Keine Datei" }, { status: 400 });
  if (!projectId && !preview) return NextResponse.json({ error: "Kein Projekt" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

  if (!rows.length) return NextResponse.json({ error: "Keine Zeilen gefunden" }, { status: 400 });

  // Detect column mapping (case-insensitive)
  const firstRow = rows[0];
  const keys = Object.keys(firstRow);

  const col = (names: string[]) =>
    keys.find((k) => names.some((n) => k.toLowerCase().includes(n.toLowerCase()))) ?? "";

  const nameKey   = col(["name", "titel", "title", "aufgabe"]);
  const descKey   = col(["description", "beschreibung", "desc"]);
  const listKey   = col(["list", "liste", "project", "projekt"]);
  const assignKey = col(["assignee", "zugewiesen", "mitarbeiter", "benutzer", "user"]);
  const statusTypeKey = col(["status type", "statustype", "type"]);
  const statusNameKey = col(["status name", "statusname", "status"]);

  const parsed = rows
    .filter((r) => r[nameKey]?.trim())
    .map((r) => ({
      title:       r[nameKey]?.trim() ?? "",
      description: r[descKey]?.trim() || null,
      list:        r[listKey]?.trim() || null,
      assignees:   r[assignKey]?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
      statusType:  r[statusTypeKey]?.trim().toLowerCase() ?? "todo",
      statusName:  r[statusNameKey]?.trim() ?? "",
      priority:    "MEDIUM" as const,
    }));

  if (preview) {
    return NextResponse.json({
      count: parsed.length,
      sample: parsed.slice(0, 5),
      columns: { nameKey, descKey, listKey, assignKey, statusTypeKey, statusNameKey },
    });
  }

  // Validate project belongs to org
  const project = await prisma.project.findFirst({
    where: { id: projectId!, workspace: { organizationId: user.organizationId } },
    include: {
      sections: {
        include: { columns: { orderBy: { position: "asc" } } },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });

  // Flatten all columns
  const allColumns = project.sections.flatMap((s) => s.columns);

  // Get workspace members for assignee matching
  const members = await prisma.workspaceMember.findMany({
    where: { workspace: { projects: { some: { id: projectId! } } } },
    include: { user: { select: { id: true, name: true } } },
  });

  const matchUser = (name: string) =>
    members.find((m) => m.user.name.toLowerCase().includes(name.toLowerCase()))?.user.id;

  // Create tasks
  let created = 0;
  const errors: string[] = [];

  for (const row of parsed) {
    const columnId = findBestColumn(allColumns, row.statusType);
    if (!columnId) { errors.push(`Keine Spalte für "${row.title}"`); continue; }

    const maxPos = await prisma.task.aggregate({ where: { columnId }, _max: { position: true } });

    try {
      const task = await prisma.task.create({
        data: {
          title: row.title,
          description: row.description,
          priority: row.priority,
          columnId,
          projectId: projectId!,
          createdById: session.userId,
          position: (maxPos._max.position ?? -1) + 1,
        },
      });

      // Assign matching users
      const assigneeIds = row.assignees
        .map(matchUser)
        .filter((id): id is string => !!id);

      if (assigneeIds.length) {
        await prisma.taskAssignee.createMany({
          data: assigneeIds.map((userId) => ({ taskId: task.id, userId })),
          skipDuplicates: true,
        });
      }

      created++;
    } catch {
      errors.push(`Fehler bei "${row.title}"`);
    }
  }

  return NextResponse.json({ created, total: parsed.length, errors });
}
