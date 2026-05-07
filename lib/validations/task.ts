import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().optional().nullable(),
  columnId: z.string().min(1),
  projectId: z.string().min(1),
  assigneeIds: z.array(z.string()).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()).optional(),
  columnId: z.string().optional(),
});

export const moveTaskSchema = z.object({
  taskId: z.string(),
  columnId: z.string(),
  position: z.number().int().min(0),
});

export const createColumnSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  projectId: z.string().min(1),
});

export const createCommentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty").max(2000),
  taskId: z.string().min(1),
});

export const createChecklistItemSchema = z.object({
  title: z.string().min(1).max(200),
  taskId: z.string().min(1),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
