export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RegisterOrgForm } from "@/components/auth/RegisterOrgForm";
import Link from "next/link";

export default async function RegisterOrgPage() {
  const superAdminExists = await prisma.user.findFirst({ where: { isSuperAdmin: true } });
  if (!superAdminExists) redirect("/setup");

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
            <span className="text-xs font-semibold text-primary border border-primary/30 rounded px-1.5 py-0.5">Enterprise</span>
          </div>
          <p className="text-muted-foreground text-sm">Register your organization to get started</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
          <h1 className="text-xl font-semibold text-foreground mb-1">Create your organization</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Set up your company workspace. You will be the organization admin.
          </p>
          <RegisterOrgForm />
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
