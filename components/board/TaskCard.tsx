"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn, formatDate, isOverdue, PRIORITY_COLORS } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import {
  MessageSquare,
  CheckSquare,
  CalendarClock,
  GripVertical,
  AlertTriangle,
} from "lucide-react";
import type { TaskType } from "./BoardView";

interface TaskCardProps {
  task: TaskType;
  isDragging?: boolean;
  canEdit: boolean;
  onTaskClick: (task: TaskType) => void;
}

export function TaskCard({ task, isDragging, canEdit, onTaskClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  };

  const overdue = isOverdue(task.dueDate) && task.priority !== "LOW";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border border-border bg-card p-3 shadow-sm cursor-pointer transition-all hover:border-primary/30 hover:shadow-md",
        isDragging && "shadow-2xl border-primary/50 rotate-2 scale-105",
        isSortableDragging && "border-primary/30"
      )}
      onClick={() => onTaskClick(task)}
    >
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-1 top-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/50" />
        </div>
      )}

      <div className="pl-3">
        {task.labels.length > 0 && (
          <div className="flex gap-1 mb-2 flex-wrap">
            {task.labels.slice(0, 4).map(({ label }) => (
              <span
                key={label.id}
                className="inline-block h-1.5 rounded-full w-8"
                style={{ backgroundColor: label.color }}
                title={label.name}
              />
            ))}
          </div>
        )}

        <p className="text-sm text-foreground font-medium leading-snug line-clamp-2">
          {task.title}
        </p>

        <div className="flex items-center justify-between mt-2.5 gap-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs rounded-md px-1.5 py-0.5 font-medium",
                PRIORITY_COLORS[task.priority]
              )}
            >
              {task.priority === "URGENT" ? "!!!" : task.priority[0]}
            </span>

            {task.dueDate && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs",
                  overdue ? "text-red-400" : "text-muted-foreground"
                )}
              >
                {overdue ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <CalendarClock className="h-3 w-3" />
                )}
                {formatDate(task.dueDate)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {task._count.comments > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                {task._count.comments}
              </span>
            )}
            {task._count.checklist > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <CheckSquare className="h-3 w-3" />
                {task._count.checklist}
              </span>
            )}
            {task.assignee && (
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[9px] bg-primary/20 text-primary">
                  {getInitials(task.assignee.name)}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
