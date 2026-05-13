"use client";

import { useEffect } from "react";

const BASE = "KanbanFlow";

export function TitleSetter({ siteTitle }: { siteTitle?: string | null }) {
  useEffect(() => {
    document.title = siteTitle ? `${siteTitle} · ${BASE}` : BASE;
  }, [siteTitle]);
  return null;
}
