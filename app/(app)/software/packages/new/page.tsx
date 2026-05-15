import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PackageForm } from "@/components/software/PackageForm";

export default async function NewPackagePage() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { organizationId: true, isAdmin: true },
  });
  if (!user?.isAdmin || !user.organizationId) notFound();

  return (
    <div className="max-w-2xl mx-auto animate-in">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Neues Paket</h1>
      <PackageForm />
    </div>
  );
}
