"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.style.width = `${pct}%`;
  }, [pct]);
  return <div ref={ref} className={cn("h-full rounded-full bg-primary/70 transition-all w-0", className)} />;
}
