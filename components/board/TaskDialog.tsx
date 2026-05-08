"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  updateTaskAction, deleteTaskAction, addCommentAction, deleteCommentAction,
  addChecklistItemAction, toggleChecklistItemAction, deleteChecklistItemAction,
  addLabelAction, removeLabelAction,
} from "@/actions/task";
import { uploadAttachmentAction, deleteAttachmentAction } from "@/actions/attachment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  X, Trash2, Flag, CalendarDays, Tag, CheckSquare, MessageSquare,
  Plus, MoreHorizontal, Loader2, Check, Paperclip, Download, FileText,
} from "lucide-react";
import { cn, formatDate, getInitials, PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/utils";
import type { TaskType, ColumnType } from "./BoardView";

type Label = { id: string; name: string; color: string };
type User_ = { id: string; name: string; avatarUrl: string | null };
type Comment = { id: string; content: string; authorId: string; author: { name: string }; createdAt: Date | string };
type ChecklistItem = { id: string; title: string; completed: boolean; position: number };
type AttachmentItem = { id: string; name: string; size: number; mimeType: string; url: string; createdAt: string };

interface TaskDialogProps {
  task: TaskType; columnId: string; projectId: string; workspaceId: string;
  canEdit: boolean; currentUserId: string; workspaceMembers: User_[];
  projectLabels: Label[]; allColumns: ColumnType[];
  onClose: () => void; onTaskUpdate: (task: TaskType) => void; onTaskDelete: () => void;
}

export function TaskDialog({
  task, columnId: _, projectId, workspaceId: _w, canEdit, currentUserId,
  workspaceMembers, projectLabels, allColumns, onClose, onTaskUpdate, onTaskDelete,
}: TaskDialogProps) {
  const t = useTranslations("board");
  const [isPending, startTransition] = useTransition();
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [editDesc, setEditDesc] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [newCheckItem, setNewCheckItem] = useState("");
  const [showAddCheck, setShowAddCheck] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/tasks/${task.id}`)
      .then((r) => r.json())
      .then((data) => {
        setComments(data.comments ?? []);
        setChecklist(data.checklist ?? []);
        setAttachments(data.attachments ?? []);
        setLoadingDetails(false);
      })
      .catch(() => setLoadingDetails(false));
  }, [task.id]);

  const handleUpdate = (data: Record<string, unknown>) => {
    startTransition(async () => {
      const result = await updateTaskAction(task.id, data);
      if (result.error) toast.error(result.error);
      else onTaskUpdate({ ...task, ...data } as TaskType);
    });
  };

  const handleDelete = () => {
    if (!confirm(t("confirmDeleteTask"))) return;
    startTransition(async () => {
      const result = await deleteTaskAction(task.id, projectId);
      if (result.error) toast.error(result.error);
      else { toast.success(t("taskDeleted")); onTaskDelete(); }
    });
  };

  const handleSaveTitle = () => {
    if (!title.trim()) return;
    handleUpdate({ title: title.trim() });
    setEditTitle(false);
  };

  const handleSaveDesc = () => {
    handleUpdate({ description: description || null });
    setEditDesc(false);
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    const formData = new FormData();
    formData.set("content", newComment.trim());
    formData.set("taskId", task.id);
    startTransition(async () => {
      const result = await addCommentAction({}, formData);
      if (result.error) toast.error(result.error);
      else {
        setComments((prev) => [...prev, { id: Date.now().toString(), content: newComment.trim(), authorId: currentUserId, author: { name: workspaceMembers.find((m) => m.id === currentUserId)?.name ?? "You" }, createdAt: new Date() }]);
        setNewComment("");
        onTaskUpdate({ ...task, _count: { ...task._count, comments: task._count.comments + 1 } });
      }
    });
  };

  const handleDeleteComment = (commentId: string) => {
    startTransition(async () => {
      const result = await deleteCommentAction(commentId, projectId);
      if (result.error) toast.error(result.error);
      else { setComments((prev) => prev.filter((c) => c.id !== commentId)); onTaskUpdate({ ...task, _count: { ...task._count, comments: Math.max(0, task._count.comments - 1) } }); }
    });
  };

  const handleAddCheckItem = () => {
    if (!newCheckItem.trim()) return;
    startTransition(async () => {
      const result = await addChecklistItemAction({ title: newCheckItem.trim(), taskId: task.id, projectId });
      if (result.error) toast.error(result.error);
      else {
        setChecklist((prev) => [...prev, { id: Date.now().toString(), title: newCheckItem.trim(), completed: false, position: prev.length }]);
        setNewCheckItem("");
        setShowAddCheck(false);
        onTaskUpdate({ ...task, _count: { ...task._count, checklist: task._count.checklist + 1 } });
      }
    });
  };

  const handleToggleCheck = (itemId: string) => {
    startTransition(async () => {
      const result = await toggleChecklistItemAction(itemId, projectId);
      if (result.error) toast.error(result.error);
      else setChecklist((prev) => prev.map((i) => (i.id === itemId ? { ...i, completed: !i.completed } : i)));
    });
  };

  const handleDeleteCheckItem = (itemId: string) => {
    startTransition(async () => {
      const result = await deleteChecklistItemAction(itemId, projectId);
      if (result.error) toast.error(result.error);
      else { setChecklist((prev) => prev.filter((i) => i.id !== itemId)); onTaskUpdate({ ...task, _count: { ...task._count, checklist: Math.max(0, task._count.checklist - 1) } }); }
    });
  };

  const handleToggleLabel = (labelId: string) => {
    const hasLabel = task.labels.some((l) => l.label.id === labelId);
    startTransition(async () => {
      if (hasLabel) {
        const result = await removeLabelAction(task.id, labelId, projectId);
        if (result.error) toast.error(result.error);
        else onTaskUpdate({ ...task, labels: task.labels.filter((l) => l.label.id !== labelId) });
      } else {
        const result = await addLabelAction(task.id, labelId, projectId);
        if (result.error) toast.error(result.error);
        else { const label = projectLabels.find((l) => l.id === labelId)!; onTaskUpdate({ ...task, labels: [...task.labels, { label }] }); }
      }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadAttachmentAction(task.id, projectId, fd);
    setUploadingFile(false);
    if (result.error) { toast.error(result.error); return; }
    setAttachments((prev) => [...prev, {
      id: result.id!, name: result.name!, size: result.size!, mimeType: result.mimeType!,
      url: `/api/attachments/${result.id}`, createdAt: result.createdAt!,
    }]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteAttachment = (attId: string) => {
    startTransition(async () => {
      const result = await deleteAttachmentAction(attId, projectId);
      if (result.error) toast.error(result.error);
      else setAttachments((prev) => prev.filter((a) => a.id !== attId));
    });
  };

  const completedCount = checklist.filter((i) => i.completed).length;
  const totalCount = checklist.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8 px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl border border-border bg-card shadow-2xl flex flex-col animate-in">
        <div className="flex items-start justify-between p-6 pb-4 shrink-0">
          <div className="flex-1 pr-4">
            {editTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") { setEditTitle(false); setTitle(task.title); } }}
                  className="text-lg font-semibold h-auto py-1"
                />
                <Button size="sm" onClick={handleSaveTitle}><Check className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditTitle(false); setTitle(task.title); }}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <h2
                className={cn("text-lg font-semibold text-foreground leading-snug", canEdit && "cursor-pointer hover:text-primary transition-colors")}
                onClick={() => canEdit && setEditTitle(true)}
              >
                {title}
              </h2>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t("inColumn")}{" "}
              <span className="font-medium text-foreground">{allColumns.find((c) => c.id === task.columnId)?.name}</span>
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canEdit && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={handleDelete} disabled={isPending}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
            {/* Description */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-foreground">{t("description")}</h3>
              </div>
              {editDesc ? (
                <div className="space-y-2">
                  <Textarea autoFocus value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={t("addDescription")} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveDesc}>{t("save")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditDesc(false); setDescription(task.description ?? ""); }}>{t("cancel")}</Button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn("text-sm text-muted-foreground rounded-md p-2 min-h-[40px]", canEdit && "cursor-pointer hover:bg-accent hover:text-foreground transition-colors")}
                  onClick={() => canEdit && setEditDesc(true)}
                >
                  {description || <span className="italic">{canEdit ? t("clickToAddDescription") : t("noDescription")}</span>}
                </div>
              )}
            </div>

            {/* Checklist */}
            {(checklist.length > 0 || canEdit) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium text-foreground">
                      {t("checklist")}
                      {totalCount > 0 && <span className="ml-2 text-xs text-muted-foreground">{completedCount}/{totalCount}</span>}
                    </h3>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAddCheck(true)}>
                      <Plus className="h-3.5 w-3.5" />
                      {t("addItem")}
                    </Button>
                  )}
                </div>

                {totalCount > 0 && (
                  <div className="mb-2 h-1.5 w-full rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(completedCount / totalCount) * 100}%` }} />
                  </div>
                )}

                {loadingDetails ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("loading")}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {checklist.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 group/check">
                        <Checkbox checked={item.completed} onCheckedChange={() => canEdit && handleToggleCheck(item.id)} disabled={!canEdit || isPending} />
                        <span className={cn("text-sm flex-1", item.completed && "line-through text-muted-foreground")}>{item.title}</span>
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/check:opacity-100" onClick={() => handleDeleteCheckItem(item.id)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}

                    {showAddCheck && canEdit && (
                      <div className="flex items-center gap-2 mt-2">
                        <Checkbox disabled />
                        <Input
                          autoFocus placeholder={t("addItemPlaceholder")} value={newCheckItem}
                          onChange={(e) => setNewCheckItem(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleAddCheckItem(); if (e.key === "Escape") setShowAddCheck(false); }}
                          className="h-7 text-sm flex-1"
                        />
                        <Button size="sm" className="h-7" onClick={handleAddCheckItem}>{t("add")}</Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setShowAddCheck(false)}><X className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">
                    Anhänge
                    {attachments.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{attachments.length}</span>}
                  </h3>
                </div>
                {canEdit && (
                  <>
                    <input ref={fileInputRef} type="file" className="hidden" aria-label="Datei anhängen" onChange={handleFileUpload} />
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}>
                      {uploadingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      {uploadingFile ? "Lädt hoch…" : "Datei anhängen"}
                    </Button>
                  </>
                )}
              </div>
              {attachments.length > 0 && (
                <div className="space-y-1.5">
                  {attachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 group/att">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{att.name}</p>
                        <p className="text-xs text-muted-foreground">{(att.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <a href={att.url} download={att.name} aria-label={`${att.name} herunterladen`} className="shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" tabIndex={-1}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive opacity-0 group-hover/att:opacity-100" onClick={() => handleDeleteAttachment(att.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-foreground">{t("comments")}</h3>
              </div>

              {loadingDetails ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("loading")}
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3 group/comment">
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[10px] bg-primary/20 text-primary">{getInitials(comment.author.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{comment.author.name}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
                          {comment.authorId === currentUserId && (
                            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover/comment:opacity-100 ml-auto" onClick={() => handleDeleteComment(comment.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{comment.content}</p>
                      </div>
                    </div>
                  ))}

                  {canEdit && (
                    <div className="flex gap-3">
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                          {getInitials(workspaceMembers.find((m) => m.id === currentUserId)?.name ?? "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <Textarea
                          placeholder={t("addComment")} value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          rows={2} className="text-sm"
                          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleAddComment(); }}
                        />
                        {newComment.trim() && (
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" className="h-7" onClick={handleAddComment} disabled={isPending}>{t("comment")}</Button>
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => setNewComment("")}>{t("cancel")}</Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-56 shrink-0 border-l border-border p-4 space-y-5 overflow-y-auto">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("priority")}</p>
              {canEdit ? (
                <Select value={task.priority} onValueChange={(v) => handleUpdate({ priority: v })} disabled={isPending}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className={cn("font-medium", PRIORITY_COLORS[p].split(" ")[0])}>{PRIORITY_LABELS[p]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className={cn("text-sm font-medium", PRIORITY_COLORS[task.priority].split(" ")[0])}>{PRIORITY_LABELS[task.priority]}</span>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("assignee")}</p>
              {canEdit ? (
                <div className="space-y-1">
                  {workspaceMembers.map((m) => {
                    const assigned = task.assignees.some((a) => a.user.id === m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          const newIds = assigned
                            ? task.assignees.filter((a) => a.user.id !== m.id).map((a) => a.user.id)
                            : [...task.assignees.map((a) => a.user.id), m.id];
                          const optimistic = assigned
                            ? task.assignees.filter((a) => a.user.id !== m.id)
                            : [...task.assignees, { user: m }];
                          startTransition(async () => {
                            const result = await updateTaskAction(task.id, { assigneeIds: newIds });
                            if (result.error) toast.error(result.error);
                            else onTaskUpdate({ ...task, assignees: optimistic });
                          });
                        }}
                        className={cn(
                          "flex items-center gap-2 w-full rounded-md px-2 py-1 text-sm transition-colors",
                          assigned ? "bg-primary/10 text-foreground" : "hover:bg-muted text-muted-foreground"
                        )}
                      >
                        <Avatar className="h-5 w-5 shrink-0">
                          <AvatarFallback className="text-[9px] bg-primary/20 text-primary">{getInitials(m.name)}</AvatarFallback>
                        </Avatar>
                        <span className="flex-1 text-left truncate">{m.name}</span>
                        {assigned && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                  {workspaceMembers.length === 0 && (
                    <span className="text-sm text-muted-foreground">{t("unassigned")}</span>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {task.assignees.length > 0 ? task.assignees.map(({ user }) => (
                    <div key={user.id} className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[9px] bg-primary/20 text-primary">{getInitials(user.name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{user.name}</span>
                    </div>
                  )) : (
                    <span className="text-sm text-muted-foreground">{t("unassigned")}</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("dueDate")}</p>
              {canEdit ? (
                <Input
                  type="date" className="h-8 text-sm"
                  value={task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""}
                  onChange={(e) => handleUpdate({ dueDate: e.target.value || null })}
                  disabled={isPending}
                />
              ) : (
                <span className="text-sm">{task.dueDate ? formatDate(task.dueDate) : t("notSet")}</span>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("column")}</p>
              {canEdit ? (
                <Select value={task.columnId} onValueChange={(v) => handleUpdate({ columnId: v })} disabled={isPending}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allColumns.map((col) => <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm">{allColumns.find((c) => c.id === task.columnId)?.name}</span>
              )}
            </div>

            {projectLabels.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("labels")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {projectLabels.map((label) => {
                    const active = task.labels.some((l) => l.label.id === label.id);
                    return (
                      <button
                        type="button" key={label.id}
                        onClick={() => canEdit && handleToggleLabel(label.id)}
                        disabled={!canEdit || isPending}
                        className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity", !active && "opacity-40 hover:opacity-70")}
                        style={{ backgroundColor: label.color + "25", color: label.color, border: `1px solid ${label.color}40` }}
                      >
                        {active && <Check className="h-3 w-3" />}
                        {label.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
