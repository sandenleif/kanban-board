import { getSession, clearSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PendingClient } from "@/components/auth/PendingClient";

export default async function PendingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { status: true, name: true, email: true },
  });

  if (!user) {
    await clearSession();
    redirect("/login");
  }

  // Already approved → go to dashboard
  if (user.status === "ACTIVE") redirect("/dashboard");

  // Suspended → show message on login page
  if (user.status === "SUSPENDED") redirect("/login");

  return <PendingClient name={user.name} email={user.email} />;
}
