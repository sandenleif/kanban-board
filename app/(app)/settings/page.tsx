import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserSettingsClient } from "@/components/settings/UserSettingsClient";

export default async function SettingsPage() {
  const session = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, createdAt: true },
  });

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto animate-in">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Settings</h1>
      <UserSettingsClient user={user} />
    </div>
  );
}
