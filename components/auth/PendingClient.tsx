"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Clock, LogOut, RefreshCw } from "lucide-react";

export function PendingClient({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction();
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white">
              <rect x="1" y="1" width="5" height="14" rx="1" fill="currentColor" />
              <rect x="8" y="1" width="5" height="9" rx="1" fill="currentColor" opacity="0.7" />
            </svg>
          </div>
          <span className="text-lg font-bold text-foreground">KanbanFlow</span>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-8 w-8 text-yellow-400" />
          </div>

          <h1 className="text-xl font-semibold text-foreground mb-2">
            Waiting for approval
          </h1>
          <p className="text-sm text-muted-foreground mb-1">
            Hey <strong className="text-foreground">{name}</strong>, your account has been created.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            An administrator needs to approve{" "}
            <span className="text-foreground font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
              {email}
            </span>{" "}
            before you can access the system.
          </p>

          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleRefresh}
              disabled={isPending}
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
              Check approval status
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={handleLogout}
              disabled={isPending}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Contact your administrator if you need access urgently.
        </p>
      </div>
    </div>
  );
}
