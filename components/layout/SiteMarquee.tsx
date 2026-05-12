"use client";

import { useEffect, useRef, useState } from "react";

const SUFFIX = "KanbanFlow · via sanden-hosting.org / Leif Sanden";

export function SiteMarquee({ siteTitle }: { siteTitle?: string | null }) {
  const text = siteTitle ? `${siteTitle}  ·  ${SUFFIX}` : SUFFIX;
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  if (!overflow) {
    return (
      <div ref={containerRef} className="text-xs text-muted-foreground/60 font-medium truncate max-w-sm hidden md:block">
        {text}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-hidden max-w-sm hidden md:block" aria-label={text}>
      <div className="flex whitespace-nowrap animate-marquee text-xs text-muted-foreground/60 font-medium">
        <span className="pr-16">{text}</span>
        <span className="pr-16" aria-hidden>{text}</span>
      </div>
    </div>
  );
}
