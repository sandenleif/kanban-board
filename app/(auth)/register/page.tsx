export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RegisterForm } from "@/components/forms/RegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;

  if (!org) redirect("/register/org");

  const organization = await prisma.organization.findUnique({
    where: { slug: org },
    select: { name: true, status: true },
  });

  if (!organization || organization.status !== "ACTIVE") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-2xl text-center">
        <p className="text-foreground font-semibold mb-2">Organization not found</p>
        <p className="text-sm text-muted-foreground mb-4">
          The organization you are trying to join does not exist or has been suspended.
        </p>
        <Link href="/register/org" className="text-primary hover:underline text-sm">
          Register a new organization
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full mb-3">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm0 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z"/>
          </svg>
          {organization.name}
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Create account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Join {organization.name} on KanbanFlow Enterprise
        </p>
      </div>
      <RegisterForm orgSlug={org} />
      <p className="text-center text-sm text-muted-foreground mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
      </p>
    </div>
  );
}
