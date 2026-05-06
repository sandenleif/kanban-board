"use client";

import { useState, useTransition } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { createTaskAction } from "@/actions/task";
import { deleteColumnAction, updateColumnAction } from "@/actions/column";
import { TaskCard } from "./TaskCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Pencil, Trash2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnType, TaskType } from "./BoardView";

type Label = { id: string; name: string; color: string };
type User = { id: string; name: string; avatarUrl: string | null };

interface BoardColumnProps {
  column: ColumnType;
  projectId: string;
  workspaceId: string;
  canEdit: boolean;
  currentUserId: string;
  workspaceMembers: User[];
  projectLabels: Label[];
  onTaskClick: (task: TaskType) => void;
  onTaskCreated: (task: TaskType) => void;
  onColumnsChange: (updater: (prev: ColumnType[]) => ColumnType[]) => void;
  allColumns: ColumnType[];
}

export function BoardColumn({
  column,
  projectId,
  canEdit,
  currentUserId,
  onTaskClick,
  onTaskCreated,
  onColumnsChange,
}: BoardColumnProps) {
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [columnName, setColumnName] = useState(column.name);
  const [isPending, startTransition] = useTransition();

  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    const formData = new FormData();
    formData.set("title", newTaskTitle.trim());
    formData.set("columnId", column.id);
    formData.set("projectId", projectId);

    startTransition(async () => {
      const result = await createTaskAction({}, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        const newTask: TaskType = {
          id: result.taskId!,
          title: newTaskTitle.trim(),
          description: null,
          priority: "MEDIUM",
          dueDate: null,
          position: column.tasks.length,
          columnId: column.id,
          projectId,
          assignee: null,
          createdBy: { id: currentUserId, name: "" },
          labels: [],
          _count: { comments: 0, checklist: 0 },
        };
        onTaskCreated(newTask);
        setNewTaskTitle("");
        setShowAddTask(false);
      }
    });
  };

  const handleRenameColumn = () => {
    if (!columnName.trim() || columnName === column.name) {
      setEditingName(false);
      setColumnName(column.name);
      return;
    }
    startTransition(async () => {
      const result = await updateColumnAction(column.id, projectId, columnName.trim());
      if (result.error) {
        toast.error(result.error);
        setColumnName(column.name);
      } else {
        toast.success("Column renamed");
        onColumnsChange((prev) =>
          prev.map((c) => (c.id === column.id ? { ...c, name: columnName.trim() } : c))
        );
      }
      setEditingName(false);
    });
  };

  const handleDeleteColumn = () => {
    if (!confirm(`Delete column "${column.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteColumnAction(column.id, projectId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Column deleted");
        onColumnsChange((prev) => prev.filter((c) => c.id !== column.id));
      }
    });
  };

  return (
    <div className="flex flex-col w-72 shrink-0 h-full">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 group">
        {editingName ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              autoFocus
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameColumn();
                if (e.key === "Escape") {
                  setEditingName(false);
                  setColumnName(column.name);
                }
              }}
              className="h-7 text-sm font-semibold"
            />
            <Button size="icon" className="h-7 w-7 shrink-0" onClick={handleRenameColumn}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={() => { setEditingName(false); setColumnName(column.name); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {column.color && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: column.color }}
              />
            )}
            <h3 className="text-sm font-semibold text-foreground truncate">{columnName}</h3>
            <span className="text-xs text-muted-foreground font-medium bg-muted rounded-full px-2 py-0.5 shrink-0">
              {column.tasks.length}
            </span>
          </div>
        )}

        {canEdit && !editingName && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingName(true)}>
                <Pencil className="h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleDeleteColumn}
              >
                <Trash2 className="h-4 w-4" />
                Delete column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col flex-1 gap-2 rounded-xl p-2 transition-colors overflow-y-auto min-h-[80px]",
          isOver ? "bg-primary/5 ring-2 ring-primary/20" : "bg-muted/30"
        )}
      >
        <SortableContext
          items={column.tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} canEdit={canEdit} onTaskClick={onTaskClick} />
          ))}
        </SortableContext>

        {column.tasks.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50 border border-dashed border-border/40 rounded-lg">
            Drop tasks here
          </div>
        )}

        {canEdit && (
          <div className="mt-1 shrink-0">
            {showAddTask ? (
              <div className="rounded-lg bg-card border border-border p-2">
                <Input
                  autoFocus
                  placeholder="Task title..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTask();
                    if (e.key === "Escape") setShowAddTask(false);
                  }}
                  className="mb-2 h-8 text-sm"
                />
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddTask} disabled={isPending}>
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => { setShowAddTask(false); setNewTaskTitle(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddTask(true)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add task
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
