"use client";

import { useEffect, useState, useTransition } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateThemeAction } from "@/actions/user";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    // Apply immediately to DOM (no flash)
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    // Persist in DB + sync cookie via server action
    startTransition(() => updateThemeAction(next ? "dark" : "light"));
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
