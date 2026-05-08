import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { User } from "lucide-react";
import { PersonalNotes } from "@/components/personal/PersonalNotes";
import { PersonalChecklist } from "@/components/personal/PersonalChecklist";

export default async function PersonalSpacePage() {
  const session = await requireSession();

  const space = await prisma.personalSpace.findUnique({
    where: { userId: session.userId },
    include: {
      personalChecklistCategories: {
        orderBy: { position: "asc" },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: { subItems: { orderBy: { position: "asc" } } },
          },
        },
      },
    },
  });

  return (
    <div className="max-w-6xl mx-auto animate-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Persönlicher Bereich</h1>
          <p className="text-muted-foreground text-sm">Deine privaten Notizen und Checklisten</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Checklist */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Checkliste</h2>
          <PersonalChecklist
            categories={space?.personalChecklistCategories ?? []}
          />
        </div>

        {/* Right: Free text */}
        <div className="flex flex-col min-h-[500px]">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Freies Textfeld</h2>
          <div className="flex-1">
            <PersonalNotes initialContent={space?.notes ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}
