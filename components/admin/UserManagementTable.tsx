"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  approveUserAction, suspendUserAction, reactivateUserAction,
  deleteUserAction, promoteToAdminAction,
} from "@/actions/admin";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials, formatDate } from "@/lib/utils";
import { CheckCircle2, Ban, Trash2, MoreHorizontal, ShieldCheck, Clock, RotateCcw } from "lucide-react";

type User = {
  id: string; name: string; email: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  isAdmin: boolean; createdAt: Date;
  _count: { workspaceMembers: number };
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING:   "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  ACTIVE:    "bg-green-400/10 text-green-400 border-green-400/20",
  SUSPENDED: "bg-red-400/10 text-red-400 border-red-400/20",
};

export function UserManagementTable({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const t = useTranslations("admin");
  const s = useTranslations("status");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const act = (fn: () => Promise<{ error?: string; success?: boolean }>, msg: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.error) toast.error(result.error);
      else { toast.success(msg); router.refresh(); }
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("tableUser")}</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("tableStatus")}</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">{t("tableWorkspaces")}</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">{t("tableRegistered")}</th>
            <th className="px-4 py-3 w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((user) => {
            const isMe = user.id === currentUserId;
            return (
              <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{user.name}</span>
                        {user.isAdmin && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">
                            <ShieldCheck className="h-3 w-3" />
                            Admin
                          </span>
                        )}
                        {isMe && <span className="text-xs text-muted-foreground shrink-0">({t("you")})</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium border rounded-full px-2.5 py-1 ${STATUS_CLASSES[user.status]}`}>
                    {user.status === "PENDING" && <Clock className="h-3 w-3" />}
                    {user.status === "ACTIVE" && <CheckCircle2 className="h-3 w-3" />}
                    {user.status === "SUSPENDED" && <Ban className="h-3 w-3" />}
                    {s(user.status)}
                  </span>
                </td>

                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{user._count.workspaceMembers}</td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDate(user.createdAt)}</td>

                <td className="px-4 py-3 text-right">
                  {!isMe && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isPending}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {user.status === "PENDING" && (
                          <DropdownMenuItem
                            className="text-green-400 focus:text-green-400"
                            onClick={() => act(() => approveUserAction(user.id), t("approved", { name: user.name }))}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {t("approve")}
                          </DropdownMenuItem>
                        )}
                        {user.status === "ACTIVE" && !user.isAdmin && (
                          <DropdownMenuItem
                            className="text-yellow-400 focus:text-yellow-400"
                            onClick={() => act(() => suspendUserAction(user.id), t("suspendedMsg", { name: user.name }))}
                          >
                            <Ban className="h-4 w-4" />
                            {t("suspend")}
                          </DropdownMenuItem>
                        )}
                        {user.status === "SUSPENDED" && (
                          <DropdownMenuItem
                            onClick={() => act(() => reactivateUserAction(user.id), t("reactivated", { name: user.name }))}
                          >
                            <RotateCcw className="h-4 w-4" />
                            {t("reactivate")}
                          </DropdownMenuItem>
                        )}
                        {!user.isAdmin && user.status === "ACTIVE" && (
                          <DropdownMenuItem
                            onClick={() => act(() => promoteToAdminAction(user.id), t("madeAdmin", { name: user.name }))}
                          >
                            <ShieldCheck className="h-4 w-4" />
                            {t("makeAdmin")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (!confirm(t("confirmDelete", { name: user.name }))) return;
                            act(() => deleteUserAction(user.id), t("deleted", { name: user.name }));
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("deleteUser")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
