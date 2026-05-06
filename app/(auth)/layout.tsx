import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white">
                <rect x="1" y="1" width="5" height="14" rx="1" fill="currentColor" />
                <rect x="8" y="1" width="5" height="9" rx="1" fill="currentColor" opacity="0.7" />
              </svg>
            </div>
            <span className="text-xl font-bold text-foreground">KanbanFlow</span>
          </div>
          <p className="text-muted-foreground text-sm">Project management for modern teams</p>
        </div>
        {children}
      </div>
    </div>
  );
}
