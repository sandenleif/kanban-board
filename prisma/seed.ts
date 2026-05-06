import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_COLUMNS = [
  { name: "Backlog", position: 0, color: "#64748b" },
  { name: "To Do", position: 1, color: "#3b82f6" },
  { name: "In Progress", position: 2, color: "#f59e0b" },
  { name: "Review", position: 3, color: "#8b5cf6" },
  { name: "Done", position: 4, color: "#22c55e" },
];

async function main() {
  console.log("🌱 Seeding database...");

  await prisma.$transaction([
    prisma.taskActivity.deleteMany(),
    prisma.taskLabelOnTask.deleteMany(),
    prisma.taskChecklistItem.deleteMany(),
    prisma.taskComment.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.task.deleteMany(),
    prisma.taskLabel.deleteMany(),
    prisma.boardColumn.deleteMany(),
    prisma.projectSection.deleteMany(),
    prisma.project.deleteMany(),
    prisma.workspaceMember.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const admin = await prisma.user.create({
    data: {
      name: "Alex Admin",
      email: "admin@demo.com",
      password: await bcrypt.hash("demo1234", 12),
      status: "ACTIVE",
      isAdmin: true,
    },
  });

  const user = await prisma.user.create({
    data: {
      name: "Jordan Member",
      email: "user@demo.com",
      password: await bcrypt.hash("demo1234", 12),
      status: "ACTIVE",
      isAdmin: false,
    },
  });

  console.log("✅ Users:", admin.email, user.email);

  const workspace = await prisma.workspace.create({
    data: {
      name: "Demo Company",
      description: "Our main workspace for product development",
      slug: "demo-company-xyz",
      ownerId: admin.id,
      members: {
        create: [
          { userId: admin.id, role: "OWNER" },
          { userId: user.id, role: "MEMBER" },
        ],
      },
    },
  });

  console.log("✅ Workspace:", workspace.name);

  // ─── Project 1: IT (with multiple sections/teams) ──────────────────────────
  const projectIT = await prisma.project.create({
    data: {
      name: "IT",
      description: "Interne IT-Projekte und Support",
      workspaceId: workspace.id,
      createdById: admin.id,
      labels: {
        create: [
          { name: "Bug", color: "#ef4444" },
          { name: "Feature", color: "#8b5cf6" },
          { name: "Support", color: "#f59e0b" },
          { name: "Infrastruktur", color: "#3b82f6" },
          { name: "Security", color: "#ef4444" },
        ],
      },
    },
  });

  // Section: Basis IT
  const sectionBasis = await prisma.projectSection.create({
    data: {
      name: "Basis IT",
      position: 0,
      projectId: projectIT.id,
      columns: { create: DEFAULT_COLUMNS },
    },
    include: { columns: true },
  });

  // Section: Klinische IT
  const sectionKlinisch = await prisma.projectSection.create({
    data: {
      name: "Klinische IT",
      position: 1,
      projectId: projectIT.id,
      columns: { create: DEFAULT_COLUMNS },
    },
    include: { columns: true },
  });

  // Section: Verwaltung
  const sectionVerwaltung = await prisma.projectSection.create({
    data: {
      name: "Verwaltung",
      position: 2,
      projectId: projectIT.id,
      columns: { create: DEFAULT_COLUMNS },
    },
    include: { columns: true },
  });

  const basisCols = sectionBasis.columns.sort((a, b) => a.position - b.position);
  const klinischCols = sectionKlinisch.columns.sort((a, b) => a.position - b.position);
  const verwaltungCols = sectionVerwaltung.columns.sort((a, b) => a.position - b.position);

  // Labels for project IT
  const itLabels = await prisma.taskLabel.findMany({ where: { projectId: projectIT.id } });
  const bugLabel = itLabels.find((l) => l.name === "Bug")!;
  const featureLabel = itLabels.find((l) => l.name === "Feature")!;
  const supportLabel = itLabels.find((l) => l.name === "Support")!;
  const infraLabel = itLabels.find((l) => l.name === "Infrastruktur")!;

  // Basis IT tasks
  const basisTask1 = await prisma.task.create({
    data: {
      title: "Server-Backup Strategie überarbeiten",
      description: "Aktuelle Backup-Lösung läuft aus dem Support. Neue Strategie evaluieren und implementieren.",
      priority: "HIGH",
      position: 0,
      columnId: basisCols[2].id, // In Progress
      projectId: projectIT.id,
      createdById: admin.id,
      assigneeId: admin.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const basisTask2 = await prisma.task.create({
    data: {
      title: "Netzwerk-Dokumentation aktualisieren",
      priority: "MEDIUM",
      position: 0,
      columnId: basisCols[1].id, // To Do
      projectId: projectIT.id,
      createdById: user.id,
      assigneeId: user.id,
    },
  });

  const basisTask3 = await prisma.task.create({
    data: {
      title: "VPN-Zugänge für Remote-Mitarbeiter einrichten",
      priority: "HIGH",
      position: 0,
      columnId: basisCols[0].id, // Backlog
      projectId: projectIT.id,
      createdById: admin.id,
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  const basisTask4 = await prisma.task.create({
    data: {
      title: "Windows Updates Q2 ausrollen",
      priority: "MEDIUM",
      position: 0,
      columnId: basisCols[4].id, // Done
      projectId: projectIT.id,
      createdById: admin.id,
      assigneeId: admin.id,
    },
  });

  await prisma.taskLabelOnTask.createMany({
    data: [
      { taskId: basisTask1.id, labelId: infraLabel.id },
      { taskId: basisTask2.id, labelId: infraLabel.id },
    ],
  });

  await prisma.taskChecklistItem.createMany({
    data: [
      { title: "Anbieter evaluieren (Veeam, Acronis, etc.)", completed: true, position: 0, taskId: basisTask1.id },
      { title: "Kosten kalkulieren", completed: true, position: 1, taskId: basisTask1.id },
      { title: "Testmigration durchführen", completed: false, position: 2, taskId: basisTask1.id },
      { title: "Go-Live", completed: false, position: 3, taskId: basisTask1.id },
    ],
  });

  await prisma.taskComment.create({
    data: {
      content: "Veeam sieht am vielversprechendsten aus. Lizenzkosten sind im Budget.",
      taskId: basisTask1.id,
      authorId: admin.id,
    },
  });

  // Klinische IT tasks
  const klinischTask1 = await prisma.task.create({
    data: {
      title: "KIS-System Update auf Version 8.2",
      description: "Krankenhausinformationssystem muss auf die neue Version aktualisiert werden. Wartungsfenster einplanen.",
      priority: "URGENT",
      position: 0,
      columnId: klinischCols[2].id, // In Progress
      projectId: projectIT.id,
      createdById: admin.id,
      assigneeId: user.id,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
  });

  const klinischTask2 = await prisma.task.create({
    data: {
      title: "Drucker auf Station 3 defekt",
      priority: "HIGH",
      position: 0,
      columnId: klinischCols[1].id, // To Do
      projectId: projectIT.id,
      createdById: user.id,
      assigneeId: user.id,
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // overdue
    },
  });

  const klinischTask3 = await prisma.task.create({
    data: {
      title: "PACS-Integration mit neuem MRT-Gerät",
      description: "Neues MRT Siemens Magnetom muss ins PACS-System eingebunden werden.",
      priority: "HIGH",
      position: 0,
      columnId: klinischCols[3].id, // Review
      projectId: projectIT.id,
      createdById: admin.id,
      assigneeId: admin.id,
    },
  });

  await prisma.taskLabelOnTask.createMany({
    data: [
      { taskId: klinischTask1.id, labelId: featureLabel.id },
      { taskId: klinischTask2.id, labelId: supportLabel.id },
      { taskId: klinischTask2.id, labelId: bugLabel.id },
    ],
  });

  await prisma.taskComment.create({
    data: {
      content: "Wartungsfenster ist Samstag 02:00-06:00 Uhr. Alle Stationen informiert.",
      taskId: klinischTask1.id,
      authorId: user.id,
    },
  });

  // Verwaltung tasks
  await prisma.task.create({
    data: {
      title: "Microsoft 365 Lizenzen verlängern",
      priority: "MEDIUM",
      position: 0,
      columnId: verwaltungCols[1].id,
      projectId: projectIT.id,
      createdById: admin.id,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.task.create({
    data: {
      title: "IT-Helpdesk Ticketsystem einrichten",
      description: "Freshdesk oder Zammad evaluieren und für alle Mitarbeiter ausrollen.",
      priority: "MEDIUM",
      position: 0,
      columnId: verwaltungCols[0].id,
      projectId: projectIT.id,
      createdById: admin.id,
    },
  });

  console.log("✅ Project 'IT' with sections: Basis IT, Klinische IT, Verwaltung");

  // ─── Project 2: Website Redesign (single section) ──────────────────────────
  const projectWeb = await prisma.project.create({
    data: {
      name: "Website Redesign",
      description: "Komplette Überarbeitung der Unternehmenswebsite",
      workspaceId: workspace.id,
      createdById: admin.id,
      labels: {
        create: [
          { name: "Design", color: "#f59e0b" },
          { name: "Frontend", color: "#22c55e" },
          { name: "Backend", color: "#3b82f6" },
          { name: "Bug", color: "#ef4444" },
        ],
      },
      sections: {
        create: {
          name: "General",
          position: 0,
          columns: { create: DEFAULT_COLUMNS },
        },
      },
    },
    include: {
      sections: { include: { columns: true } },
      labels: true,
    },
  });

  const webCols = projectWeb.sections[0].columns.sort((a, b) => a.position - b.position);
  const webLabels = projectWeb.labels;
  const designLabel = webLabels.find((l) => l.name === "Design")!;
  const frontendLabel = webLabels.find((l) => l.name === "Frontend")!;

  const webTask1 = await prisma.task.create({
    data: {
      title: "Hero-Sektion neu gestalten",
      description: "Modernes, animiertes Hero mit klarem Call-to-Action.",
      priority: "HIGH",
      position: 0,
      columnId: webCols[2].id,
      projectId: projectWeb.id,
      createdById: admin.id,
      assigneeId: user.id,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });

  const webTask2 = await prisma.task.create({
    data: {
      title: "Responsive Navigation implementieren",
      priority: "HIGH",
      position: 0,
      columnId: webCols[3].id,
      projectId: projectWeb.id,
      createdById: admin.id,
      assigneeId: admin.id,
    },
  });

  await prisma.task.create({
    data: {
      title: "Kontaktformular Validierung fixen",
      priority: "URGENT",
      position: 0,
      columnId: webCols[1].id,
      projectId: projectWeb.id,
      createdById: user.id,
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.task.create({
    data: {
      title: "Analytics einbinden",
      priority: "LOW",
      position: 0,
      columnId: webCols[4].id,
      projectId: projectWeb.id,
      createdById: admin.id,
      assigneeId: admin.id,
    },
  });

  await prisma.taskLabelOnTask.createMany({
    data: [
      { taskId: webTask1.id, labelId: designLabel.id },
      { taskId: webTask1.id, labelId: frontendLabel.id },
      { taskId: webTask2.id, labelId: frontendLabel.id },
    ],
  });

  await prisma.taskChecklistItem.createMany({
    data: [
      { title: "Wireframe erstellen", completed: true, position: 0, taskId: webTask1.id },
      { title: "Figma-Mockup fertigstellen", completed: true, position: 1, taskId: webTask1.id },
      { title: "HTML/CSS implementieren", completed: false, position: 2, taskId: webTask1.id },
      { title: "Animationen hinzufügen", completed: false, position: 3, taskId: webTask1.id },
    ],
  });

  await prisma.taskActivity.createMany({
    data: [
      { type: "CREATED", content: "created this task", taskId: webTask1.id, userId: admin.id },
      { type: "ASSIGNED", content: "assigned this task", taskId: webTask1.id, userId: admin.id },
    ],
  });

  console.log("✅ Project 'Website Redesign'");

  console.log("\n🎉 Seed complete!");
  console.log("📝 Demo credentials:");
  console.log("   admin@demo.com  /  demo1234");
  console.log("   user@demo.com   /  demo1234");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
