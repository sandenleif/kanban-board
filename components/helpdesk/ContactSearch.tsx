"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Search, Loader2, User, UserPlus, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createContactAction } from "@/actions/contact";
import { toast } from "sonner";

interface Contact {
  name: string;
  email: string;
  source: "ad" | "manual";
}

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

interface Props {
  hasElastic?: boolean;
  ticketId?: string;
  onContactCreated?: (id: string, name: string, email: string) => void;
}

export function ContactSearch({ hasElastic = false, ticketId, onContactCreated }: Props) {
  const [name, setName]             = useState("");
  const [email, setEmail]           = useState("");
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState<Contact[]>([]);
  const [loading, setLoading]       = useState(false);
  const [showDrop, setShowDrop]     = useState(false);
  const [fromAd, setFromAd]         = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({ phone: "", company: "", department: "" });
  const [isPending, startTransition] = useTransition();

  const dropRef  = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timerRef = useRef<any>(undefined);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleQueryChange = (v: string) => {
    setQuery(v); setName(v); setFromAd(false);
    clearTimeout(timerRef.current);
    if (v.length >= 2) {
      setLoading(true); setShowDrop(true);
      timerRef.current = setTimeout(async () => {
        const r = await searchContacts(v);
        setResults(r); setLoading(false);
      }, 300);
    } else {
      setResults([]); setShowDrop(false); setLoading(false);
    }
  };

  const selectContact = (c: Contact) => {
    setName(c.name); setEmail(c.email); setQuery(c.name);
    setFromAd(c.source === "ad"); setShowDrop(false);
  };

  const handleCreateContact = () => {
    if (!name.trim()) { toast.error("Name erforderlich"); return; }
    startTransition(async () => {
      const r = await createContactAction({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: createData.phone.trim() || undefined,
        company: createData.company.trim() || undefined,
        department: createData.department.trim() || undefined,
        source: fromAd ? "ad" : "manual",
        ticketId,
      });
      if (r.error) { toast.error(r.error); return; }
      toast.success(`Kunde "${name}" angelegt`);
      setShowCreate(false);
      onContactCreated?.(r.id!, name, email);
    });
  };

  const isNewContact = name.trim() && !fromAd;

  return (
    <div className="space-y-2">
      <input type="hidden" name="fromName" value={name} />
      <input type="hidden" name="fromEmail" value={email} />

      <div ref={dropRef} className="relative">
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Name oder E-Mail des Anfragestellers…" className="pl-9 pr-9" autoComplete="off" />
          {loading
            ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            : <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />}
        </div>

        {showDrop && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            {loading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Suche…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {hasElastic ? "Keine Treffer in AD/Exchange" : "Kein Eintrag gefunden — Freitext möglich"}
              </div>
            ) : (
              results.map((c, i) => (
                <button key={i} type="button" onMouseDown={() => selectContact(c)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                  </div>
                  {c.source === "ad" && (
                    <span className="ml-auto text-[10px] text-primary bg-primary/10 rounded px-1.5 py-0.5">AD</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Email field */}
      <Input value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="E-Mail-Adresse (optional)" type="email" aria-label="E-Mail des Anfragestellers" />

      {/* Create contact button — shown when free text entered */}
      {isNewContact && !showCreate && (
        <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7"
          onClick={() => setShowCreate(true)}>
          <UserPlus className="h-3.5 w-3.5" />
          "{name}" als Kunden anlegen
        </Button>
      )}

      {/* Inline create form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-primary" /> Neuen Kunden anlegen
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Telefon" value={createData.phone}
              onChange={(e) => setCreateData((d) => ({ ...d, phone: e.target.value }))}
              className="h-7 text-xs" />
            <Input placeholder="Firma" value={createData.company}
              onChange={(e) => setCreateData((d) => ({ ...d, company: e.target.value }))}
              className="h-7 text-xs" />
            <Input placeholder="Abteilung" value={createData.department}
              onChange={(e) => setCreateData((d) => ({ ...d, department: e.target.value }))}
              className="h-7 text-xs col-span-2" />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-xs gap-1" onClick={handleCreateContact} disabled={isPending}>
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Anlegen
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowCreate(false)}>
              <X className="h-3 w-3" /> Abbrechen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
