"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Loader2, User } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Contact {
  name: string;
  email: string;
  source: "ad" | "manual";
}

// Search AD/Exchange contacts via Elasticsearch
async function searchContacts(q: string): Promise<Contact[]> {
  if (!q || q.length < 2) return [];
  try {
    const res = await fetch(`/api/helpdesk/contact-search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export function ContactSearch({ hasElastic = false }: { hasElastic?: boolean }) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timerRef = useRef<any>(undefined);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleQueryChange = (v: string) => {
    setQuery(v);
    setName(v);
    clearTimeout(timerRef.current);
    if (v.length >= 2) {
      setLoading(true);
      setShowDrop(true);
      timerRef.current = setTimeout(async () => {
        const r = await searchContacts(v);
        setResults(r);
        setLoading(false);
      }, 300);
    } else {
      setResults([]);
      setShowDrop(false);
      setLoading(false);
    }
  };

  const selectContact = (c: Contact) => {
    setName(c.name);
    setEmail(c.email);
    setQuery(c.name);
    setShowDrop(false);
  };

  return (
    <div className="space-y-2">
      {/* Hidden form fields */}
      <input type="hidden" name="fromName" value={name} />
      <input type="hidden" name="fromEmail" value={email} />

      <div ref={dropRef} className="relative">
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Name oder E-Mail eingeben…"
            className="pl-9 pr-9"
            autoComplete="off"
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          {!loading && query && (
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {showDrop && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            {loading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Suche…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {hasElastic ? "Keine Treffer in AD/Exchange" : "Freitext — kein AD konfiguriert"}
              </div>
            ) : (
              results.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseDown={() => selectContact(c)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                >
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                  </div>
                  {c.source === "ad" && (
                    <span className="ml-auto text-[10px] text-primary bg-primary/10 rounded px-1.5">AD</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Email field always visible for free-text entry */}
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="E-Mail-Adresse (optional)"
        type="email"
        aria-label="E-Mail des Anfragestellers"
      />
    </div>
  );
}
