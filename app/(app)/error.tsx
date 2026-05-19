"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6 text-center px-4">
      <div className="p-4 rounded-full bg-destructive/10">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Etwas ist schiefgelaufen</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Ein unerwarteter Fehler ist aufgetreten. Versuche die Seite neu zu laden.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/50 font-mono">ID: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <Button size="sm" onClick={reset}>
          <RefreshCw className="h-3.5 w-3.5" /> Neu laden
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/dashboard"><Home className="h-3.5 w-3.5" /> Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
