import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function generateSlug(name: string): string {
  const base = slugify(name);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ticketAge(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  const mins = totalMinutes % 60;
  if (hours > 0) return `${hours} h ${mins} m`;
  return `${mins} m`;
}

export function isOverdue(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

export function isDueSoon(
  date: Date | string | null | undefined,
  days = 3
): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-slate-400 bg-slate-400/10",
  MEDIUM: "text-blue-400 bg-blue-400/10",
  HIGH: "text-orange-400 bg-orange-400/10",
  URGENT: "text-red-400 bg-red-400/10",
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export function canEdit(role: string): boolean {
  return ["OWNER", "ADMIN", "MEMBER"].includes(role);
}

export function canAdmin(role: string): boolean {
  return ["OWNER", "ADMIN"].includes(role);
}
