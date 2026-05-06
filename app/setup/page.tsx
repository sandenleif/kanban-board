export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetupForm } from "@/components/auth/SetupForm";

export default async function SetupPage() {
  const userCount = await prisma.user.count();
  if (userCount > 0) redirect("/login");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="text-white">
                <rect x="1" y="1" width="5" height="14" rx="1" fill="currentColor" />
                <rect x="8" y="1" width="5" height="9" rx="1" fill="currentColor" opacity="0.7" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-foreground">KanbanFlow</span>
          </div>
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-3 py-1 text-xs text-primary font-medium mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            First-time setup
          </div>
          <p className="text-muted-foreground text-sm">
            Create the administrator account to get started.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
          <h1 className="text-xl font-semibold text-foreground mb-1">
            Create Admin Account
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            This account has full system access and can approve new users.
          </p>
          <SetupForm />
        </div>
      </div>
    </div>
  );
}
