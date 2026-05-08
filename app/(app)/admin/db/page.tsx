import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { DbBrowser } from "@/components/admin/DbBrowser";

type TableInfo = { table_name: string; row_count: bigint };
type ColumnInfo = { column_name: string; data_type: string; is_nullable: string };

export default async function DbBrowserPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; page?: string }>;
}) {
  const session = await requireSession();
  const { table: selectedTable, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const pageSize = 50;

  const currentUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });
  if (!currentUser?.isAdmin) notFound();

  // All tables with row counts
  const tables = await prisma.$queryRaw<TableInfo[]>`
    SELECT
      t.table_name,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public')::bigint AS row_count
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  `;

  // Actual row counts per table
  const tableCounts: Record<string, number> = {};
  for (const t of tables) {
    try {
      const res = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
        `SELECT COUNT(*)::bigint AS count FROM "${t.table_name}"`
      );
      tableCounts[t.table_name] = Number(res[0].count);
    } catch {
      tableCounts[t.table_name] = 0;
    }
  }

  let columns: ColumnInfo[] = [];
  let rows: Record<string, unknown>[] = [];
  let totalRows = 0;

  if (selectedTable && tables.some((t) => t.table_name === selectedTable)) {
    columns = await prisma.$queryRaw<ColumnInfo[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${selectedTable}
      ORDER BY ordinal_position
    `;

    totalRows = tableCounts[selectedTable] ?? 0;
    const offset = (page - 1) * pageSize;

    rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${selectedTable}" ORDER BY 1 LIMIT ${pageSize} OFFSET ${offset}`
    );
  }

  return (
    <DbBrowser
      tables={tables.map((t) => ({ name: t.table_name, count: tableCounts[t.table_name] ?? 0 }))}
      selectedTable={selectedTable ?? null}
      columns={columns}
      rows={rows}
      totalRows={totalRows}
      page={page}
      pageSize={pageSize}
    />
  );
}
