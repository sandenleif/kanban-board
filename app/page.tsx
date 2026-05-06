export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  // First-run: no users exist → go to setup
  const userCount = await prisma.user.count();
  if (userCount === 0) redirect("/setup");

  const session = await getSession();
  if (!session) redirect("/login");

  redirect("/dashboard");
}
