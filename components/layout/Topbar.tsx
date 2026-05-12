"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import type { SessionPayload } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";
import { SiteMarquee } from "./SiteMarquee";

type Notification = {
  id: string; type: string; message: string; read: boolean; createdAt: Date | string;
  taskId: string | null; projectId: string | null; workspaceId: string | null;
};

interface TopbarProps {
  session: SessionPayload;
  avatarSrc?: string | null;
  notifications?: Notification[];
  siteTitle?: string | null;
}

export function Topbar({ session, avatarSrc, notifications = [], siteTitle }: TopbarProps) {
  const t = useTranslations("topbar");
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => { await logoutAction(); });
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <SiteMarquee siteTitle={siteTitle} />
      <div className="flex items-center gap-1">
        <NotificationBell initialNotifications={notifications} />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
              <Avatar className="h-8 w-8">
                {avatarSrc && <AvatarImage src={avatarSrc} alt={session.name} />}
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                  {getInitials(session.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold">{session.name}</p>
                <p className="text-xs text-muted-foreground truncate">{session.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <User className="h-4 w-4" />
                {t("profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="h-4 w-4" />
                {t("settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive cursor-pointer"
              onClick={handleLogout}
              disabled={isPending}
            >
              <LogOut className="h-4 w-4" />
              {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
