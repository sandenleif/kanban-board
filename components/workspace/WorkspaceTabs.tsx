"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { LayoutGrid, CheckSquare } from "lucide-react";

interface Props {
  projectsContent: React.ReactNode;
  checklistContent: React.ReactNode;
  noteContent: React.ReactNode;
}

export function WorkspaceTabs({ projectsContent, checklistContent, noteContent }: Props) {
  const [tab, setTab] = useState<"projects" | "checklist">("projects");

  return (
    <div className="flex gap-6 flex-1 min-h-0">
      {/* Main panel */}
      <div className="flex-1 min-w-0">
        {/* Tab bar */}
        <div className="flex gap-1 mb-5 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("projects")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === "projects"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Projekte
          </button>
          <button
            type="button"
            onClick={() => setTab("checklist")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === "checklist"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Checkliste
          </button>
        </div>

        <div>
          {tab === "projects" && projectsContent}
          {tab === "checklist" && checklistContent}
        </div>
      </div>

      {/* Right note panel */}
      <div className="w-72 shrink-0 flex flex-col min-h-[400px] max-h-[calc(100vh-180px)]">
        {noteContent}
      </div>
    </div>
  );
}
