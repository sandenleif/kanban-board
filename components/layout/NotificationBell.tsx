"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNotificationsAction, markAllReadAction, markOneReadAction } from "@/actions/notification";
import { cn, formatDate } from "@/lib/utils";

type Notification = {
  id: string; type: string; message: string; read: boolean; createdAt: Date | string;
  taskId: string | null; projectId: string | null; workspaceId: string | null;
};

interface NotificationBellProps {
  initialNotifications: Notification[];
}

export function NotificationBell({ initialNotifications }: NotificationBellProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      startTransition(async () => {
        const fresh = await getNotificationsAction();
        setNotifications(fresh as Notification[]);
      });
    }
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllReadAction();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    });
  };

  const handleClickNotification = (n: Notification) => {
    startTransition(async () => {
      if (!n.read) {
        await markOneReadAction(n.id);
        setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
      }
      if (n.workspaceId && n.projectId) {
        setOpen(false);
        router.push(`/workspaces/${n.workspaceId}/projects/${n.projectId}/board`);
      }
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" forceMount>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost" size="sm" className="h-7 text-xs gap-1"
              onClick={handleMarkAllRead} disabled={isPending}
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClickNotification(n)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors hover:bg-muted/50",
                  !n.read && "bg-primary/5"
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                  <div className={cn("flex-1 min-w-0", n.read && "ml-3.5")}>
                    <p className="text-sm text-foreground leading-snug">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(n.createdAt as Date)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
