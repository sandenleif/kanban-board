import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center px-4 bg-background">
      <div className="p-4 rounded-full bg-muted">
        <SearchX className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-5xl font-bold text-foreground">404</h1>
        <h2 className="text-xl font-semibold text-foreground">Seite nicht gefunden</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Die aufgerufene Seite existiert nicht oder wurde verschoben.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard"><Home className="h-3.5 w-3.5" /> Zurück zum Dashboard</Link>
      </Button>
    </div>
  );
}
