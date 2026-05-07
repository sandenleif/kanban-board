"use client";

import { useState, useTransition } from "react";
import { resetDatabaseAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TriangleAlert, Loader2 } from "lucide-react";

const CONFIRM_WORD = "RESET";

export function DangerZone() {
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();

  const confirmed = input === CONFIRM_WORD;

  const handleReset = () => {
    if (!confirmed) return;
    startTransition(async () => {
      await resetDatabaseAction();
    });
  };

  return (
    <Card className="border-destructive/40 mt-6">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <TriangleAlert className="h-5 w-5" />
          Danger Zone
        </CardTitle>
        <CardDescription>
          These actions are irreversible and affect all users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-foreground mb-1">Reset database & run setup again</p>
          <p className="text-sm text-muted-foreground mb-4">
            Deletes all users, workspaces, projects, tasks and settings permanently.
            The setup wizard will become available again.
          </p>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold text-destructive">{CONFIRM_WORD}</span> to confirm
            </p>
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                placeholder={CONFIRM_WORD}
                className="font-mono max-w-[140px] border-destructive/40 focus-visible:ring-destructive/40"
                disabled={isPending}
              />
              <Button
                variant="destructive"
                onClick={handleReset}
                disabled={!confirmed || isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset everything
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
