"use client";

import { useState, useCallback, useTransition, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  pointerWithin, rectIntersection,
  useSensor, useSensors, type DragStartEvent, type DragOverEvent, type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { moveTaskAction } from "@/actions/task";
import { createColumnAction } from "@/actions/column";
import { createSectionAction, updateSectionAction, deleteSectionAction } from "@/actions/section";
import { BoardColumn } from "./BoardColumn";
import { TaskCard } from "./TaskCard";
import { TaskDialog } from "./TaskDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, X, Check, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Label = { id: string; name: string; color: string };
type User = { id: string; name: string; avatarUrl: string | null };

export type TaskType = {
  id: string; title: string; description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: Date | null; position: number; columnId: string; projectId: string;
  assignees: { user: { id: string; name: string; avatarUrl: string | null } }[];
  createdBy: { id: string; name: string };
  labels: { label: Label }[];
  _count: { comments: number; checklist: number };
};

export type ColumnType = {
  id: string; name: string; position: number; color: string | null;
  sectionId: string; tasks: TaskType[];
  _count?: { tasks: number };
};

export type SectionType = {
  id: string; name: string; position: number; columns: ColumnType[];
};

interface BoardViewProps {
  project: { id: string; name: string; workspaceId: string; sections: SectionType[]; labels: Label[] };
  workspaceId: string;
  canEdit: boolean;
  currentUserId: string;
  workspaceMembers: User[];
}

// Collision detection: pointer position first (most accurate), then rect intersection fallback
const kanbanCollision: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};

export function BoardView({ project, workspaceId, canEdit, currentUserId, workspaceMembers }: BoardViewProps) {
  const t = useTranslations("board");
  const router = useRouter();
  const [sections, setSections] = useState<SectionType[]>(project.sections);
  const [activeSectionId, setActiveSectionId] = useState<string>(project.sections[0]?.id ?? "");
  const [activeTask, setActiveTask] = useState<TaskType | null>(null);
  const activeTaskRef = useRef(activeTask);
  const [selectedTask, setSelectedTask] = useState<TaskType | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  // Debounce search so filter doesn't recompute on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(filterSearch), 200);
    return () => clearTimeout(id);
  }, [filterSearch]);

  // Keep ref in sync so interval closure sees latest value
  useEffect(() => { activeTaskRef.current = activeTask; }, [activeTask]);

  // Sync incoming prop changes to local state (server refreshes)
  useEffect(() => {
    if (!activeTaskRef.current) setSections(project.sections);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // Live-update: refresh server data every 30s when tab is visible and not dragging
  useEffect(() => {
    const id = setInterval(() => {
      if (!activeTaskRef.current && document.visibilityState === "visible") {
        router.refresh();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];
  const allColumns = activeSection?.columns ?? [];

  const findTaskAndColumn = useCallback((taskId: string) => {
    for (const section of sections) {
      for (const col of section.columns) {
        const task = col.tasks.find((t) => t.id === taskId);
        if (task) return { task, column: col, section };
      }
    }
    return null;
  }, [sections]);

  const findColumn = useCallback((id: string) => allColumns.find((c) => c.id === id), [allColumns]);
  const updateSections = useCallback((updater: (prev: SectionType[]) => SectionType[]) => setSections(updater), []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const found = findTaskAndColumn(event.active.id as string);
    if (found) setActiveTask(found.task);
  }, [findTaskAndColumn]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeResult = findTaskAndColumn(active.id as string);
    if (!activeResult) return;
    const overColumnId = findColumn(over.id as string) ? (over.id as string) : findTaskAndColumn(over.id as string)?.column.id;
    if (!overColumnId || activeResult.column.id === overColumnId) return;

    setSections((prev) => prev.map((section) => {
      const hasSrc = section.columns.some((c) => c.id === activeResult.column.id);
      const hasDst = section.columns.some((c) => c.id === overColumnId);
      if (!hasSrc && !hasDst) return section; // skip sections not involved
      const newColumns = section.columns.map((col) => ({ ...col, tasks: [...col.tasks] }));
      const srcCol = newColumns.find((c) => c.id === activeResult.column.id);
      const dstCol = newColumns.find((c) => c.id === overColumnId);
      if (!srcCol || !dstCol) return section;
      const task = srcCol.tasks.find((t) => t.id === active.id)!;
      srcCol.tasks = srcCol.tasks.filter((t) => t.id !== active.id);
      srcCol.tasks.forEach((t, i) => (t.position = i));
      const overTask = dstCol.tasks.find((t) => t.id === over.id);
      const insertIdx = overTask ? dstCol.tasks.indexOf(overTask) : dstCol.tasks.length;
      dstCol.tasks.splice(insertIdx, 0, { ...task, columnId: overColumnId });
      dstCol.tasks.forEach((t, i) => (t.position = i));
      return { ...section, columns: newColumns };
    }));
  }, [findTaskAndColumn, findColumn]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over || active.id === over.id) return;
    const task = sections.flatMap((s) => s.columns.flatMap((c) => c.tasks)).find((t) => t.id === active.id);
    if (!task) return;
    startTransition(async () => {
      const result = await moveTaskAction({ taskId: active.id as string, columnId: task.columnId, position: task.position, projectId: project.id });
      if (result.error) { toast.error(result.error); setSections(project.sections); }
    });
  }, [sections, project.id, project.sections]);

  const handleAddColumn = () => {
    if (!newColumnName.trim() || !activeSection) return;
    const name = newColumnName.trim();
    const formData = new FormData();
    formData.set("name", name);
    formData.set("sectionId", activeSection.id);
    startTransition(async () => {
      const result = await createColumnAction({}, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        const newCol: ColumnType = {
          id: result.columnId!,
          name,
          position: activeSection.columns.length,
          color: null,
          sectionId: activeSection.id,
          tasks: [],
        };
        updateSections((prev) =>
          prev.map((s) =>
            s.id === activeSection.id ? { ...s, columns: [...s.columns, newCol] } : s
          )
        );
        setNewColumnName("");
        setShowAddColumn(false);
      }
    });
  };

  const handleAddSection = () => {
    if (!newSectionName.trim()) return;
    const formData = new FormData();
    formData.set("name", newSectionName.trim());
    formData.set("projectId", project.id);
    startTransition(async () => {
      const result = await createSectionAction({}, formData);
      if (result.error) { toast.error(result.error); }
      else {
        const newSection: SectionType = { id: result.sectionId!, name: newSectionName.trim(), position: sections.length, columns: [] };
        setSections((prev) => [...prev, newSection]);
        setActiveSectionId(result.sectionId!);
        setNewSectionName("");
        setShowAddSection(false);
        toast.success(t("sectionCreated", { name: newSection.name }));
      }
    });
  };

  const handleRenameSection = (sectionId: string) => {
    if (!editingSectionName.trim()) return;
    startTransition(async () => {
      const result = await updateSectionAction(sectionId, editingSectionName.trim());
      if (result.error) toast.error(result.error);
      else { setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, name: editingSectionName.trim() } : s)); setEditingSectionId(null); }
    });
  };

  const handleDeleteSection = (sectionId: string, name: string) => {
    if (!confirm(t("confirmDeleteSection", { name }))) return;
    startTransition(async () => {
      const result = await deleteSectionAction(sectionId);
      if (result.error) { toast.error(result.error); }
      else {
        const remaining = sections.filter((s) => s.id !== sectionId);
        setSections(remaining);
        if (activeSectionId === sectionId) setActiveSectionId(remaining[0]?.id ?? "");
        toast.success(t("sectionDeleted"));
      }
    });
  };

  const handleTaskCreated = useCallback((task: TaskType) => {
    setSections((prev) => prev.map((s) => ({ ...s, columns: s.columns.map((col) => col.id === task.columnId ? { ...col, tasks: [...col.tasks, task] } : col) })));
  }, []);

  const handleColumnsChange = useCallback((updater: (prev: ColumnType[]) => ColumnType[]) => {
    setSections((prev) => prev.map((s) => s.id === activeSectionId ? { ...s, columns: updater(s.columns) } : s));
  }, [activeSectionId]);

  const filteredColumns = useMemo(() => {
    if (!debouncedSearch) return allColumns;
    const q = debouncedSearch.toLowerCase();
    return allColumns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.assignees.some((a) => a.user.name.toLowerCase().includes(q))
      ),
    }));
  }, [allColumns, debouncedSearch]);

  return (
    <div className="flex flex-col h-full">
      {/* Section Tabs */}
      <div className="flex items-center gap-1 px-6 pt-3 pb-0 border-b border-border bg-background shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-0">
          {sections.map((section) => (
            <div key={section.id} className="relative group/tab flex items-center shrink-0">
              {editingSectionId === section.id ? (
                <div className="flex items-center gap-1 px-1 mb-[-1px]">
                  <Input
                    autoFocus
                    value={editingSectionName}
                    onChange={(e) => setEditingSectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSection(section.id);
                      if (e.key === "Escape") setEditingSectionId(null);
                    }}
                    className="h-7 w-32 text-sm"
                  />
                  <Button size="icon" className="h-6 w-6" onClick={() => handleRenameSection(section.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingSectionId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    section.id === activeSectionId
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  {section.name}
                  <span className="text-xs text-muted-foreground ml-0.5">
                    ({section.columns.reduce((s, c) => s + c.tasks.length, 0)})
                  </span>
                </button>
              )}

              {canEdit && editingSectionId !== section.id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 opacity-0 group-hover/tab:opacity-100 absolute right-0 top-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => { setEditingSectionId(section.id); setEditingSectionName(section.name); }}>
                      <Pencil className="h-4 w-4" />
                      {t("rename")}
                    </DropdownMenuItem>
                    {sections.length > 1 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteSection(section.id, section.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("deleteSection")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="shrink-0 ml-2 mb-[-1px]">
            {showAddSection ? (
              <div className="flex items-center gap-1 pb-2">
                <Input
                  autoFocus
                  placeholder={t("sectionNamePlaceholder")}
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddSection();
                    if (e.key === "Escape") setShowAddSection(false);
                  }}
                  className="h-7 w-36 text-sm"
                />
                <Button size="icon" className="h-7 w-7" onClick={handleAddSection} disabled={isPending}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowAddSection(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddSection(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("addSection")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-border bg-background/50 shrink-0">
        <Input
          placeholder={t("searchTasks")}
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          className="w-52 h-8 text-sm"
        />
        <span className="text-xs text-muted-foreground ml-auto">
          {allColumns.reduce((s, c) => s + c.tasks.length, 0)} {t("tasksIn")}{" "}
          <strong className="text-foreground">{activeSection?.name}</strong>
        </span>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext sensors={sensors} collisionDetection={kanbanCollision} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full p-6 pb-4">
            <SortableContext items={filteredColumns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              {filteredColumns.map((column) => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  projectId={project.id}
                  workspaceId={workspaceId}
                  canEdit={canEdit}
                  currentUserId={currentUserId}
                  workspaceMembers={workspaceMembers}
                  projectLabels={project.labels}
                  onTaskClick={(task) => setSelectedTask(task)}
                  onTaskCreated={handleTaskCreated}
                  onColumnsChange={handleColumnsChange}
                  allColumns={allColumns}
                />
              ))}
            </SortableContext>

            {canEdit && activeSection && (
              <div className="w-72 shrink-0">
                {showAddColumn ? (
                  <div className="rounded-xl border border-border bg-card/50 p-3">
                    <Input
                      autoFocus
                      placeholder={t("columnNamePlaceholder")}
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddColumn();
                        if (e.key === "Escape") setShowAddColumn(false);
                      }}
                      className="mb-2"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddColumn} disabled={isPending}>
                        <Check className="h-4 w-4" />
                        {t("add")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowAddColumn(false); setNewColumnName(""); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddColumn(true)}
                    className="w-full flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    {t("addColumn")}
                  </button>
                )}
              </div>
            )}
          </div>

          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} isDragging canEdit={false} onTaskClick={() => {}} />}
          </DragOverlay>
        </DndContext>
      </div>

      {selectedTask && (
        <TaskDialog
          task={selectedTask}
          columnId={selectedTask.columnId}
          projectId={project.id}
          workspaceId={workspaceId}
          canEdit={canEdit}
          currentUserId={currentUserId}
          workspaceMembers={workspaceMembers}
          projectLabels={project.labels}
          allColumns={allColumns}
          onClose={() => setSelectedTask(null)}
          onTaskUpdate={(updated) => {
            setSelectedTask(updated);
            updateSections((prev) => prev.map((s) => ({ ...s, columns: s.columns.map((col) => ({ ...col, tasks: col.tasks.map((t) => (t.id === updated.id ? updated : t)) })) })));
          }}
          onTaskDelete={() => {
            updateSections((prev) => prev.map((s) => ({ ...s, columns: s.columns.map((col) => ({ ...col, tasks: col.tasks.filter((t) => t.id !== selectedTask.id) })) })));
            setSelectedTask(null);
          }}
        />
      )}
    </div>
  );
}
