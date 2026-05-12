"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, Users, Building2, Mail, Phone, Database, Edit2, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { deleteContactAction, updateContactAction } from "@/actions/contact";
import { toast } from "sonner";
import Link from "next/link";

type Contact = {
  id: string; name: string; email: string | null; phone: string | null;
  company: string | null; department: string | null; source: string;
  createdAt: Date; _count: { tickets: number };
};

interface Props {
  contacts: Contact[];
  currentFilters: { q?: string; source?: string };
  isAdmin: boolean;
}

export function ContactsClient({ contacts: initial, currentFilters, isAdmin }: Props) {
  const router = useRouter();
  const [contacts, setContacts] = useState(initial);
  const [search, setSearch] = useState(currentFilters.q ?? "");
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Contact>>({});
  const [isPending, startTransition] = useTransition();

  const applyFilter = (key: string, value: string) => {
    const p = new URLSearchParams();
    if (currentFilters.q) p.set("q", currentFilters.q);
    if (currentFilters.source) p.set("source", currentFilters.source);
    if (value) p.set(key, value); else p.delete(key);
    startTransition(() => router.push(`/helpdesk/contacts?${p}`));
  };

  const doSearch = () => applyFilter("q", search);

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    startTransition(async () => {
      const r = await deleteContactAction(id);
      if (r.error) { toast.error(r.error); return; }
      setContacts((prev) => prev.filter((c) => c.id !== id));
      toast.success("Kontakt gelöscht");
    });
  };

  const startEdit = (c: Contact) => {
    setEditId(c.id);
    setEditData({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", company: c.company ?? "", department: c.department ?? "" });
  };

  const saveEdit = (id: string) => {
    startTransition(async () => {
      const r = await updateContactAction(id, editData as Record<string, string>);
      if (r.error) { toast.error(r.error); return; }
      setContacts((prev) => prev.map((c) => c.id === id ? { ...c, ...editData } : c));
      setEditId(null);
      toast.success("Gespeichert");
    });
  };

  const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
    manual: { label: "Freitext",       color: "bg-gray-400/10 text-gray-400 border-gray-400/20" },
    ad:     { label: "Active Directory", color: "bg-blue-400/10 text-blue-400 border-blue-400/20" },
    exchange: { label: "Exchange",     color: "bg-green-400/10 text-green-400 border-green-400/20" },
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-0 rounded-lg border border-border overflow-hidden text-xs font-medium">
          {[
            { value: "", label: "Alle" },
            { value: "manual", label: "Freitext" },
            { value: "ad", label: "Active Directory" },
          ].map((s) => (
            <button key={s.value} type="button" onClick={() => applyFilter("source", s.value)}
              className={`px-3 py-1.5 transition-colors ${(currentFilters.source ?? "") === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <Input placeholder="Name, E-Mail, Firma…" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()} className="h-8 w-48 text-xs" />
          <Button size="sm" className="h-8 w-8 p-0" onClick={doSearch}><Search className="h-3.5 w-3.5" /></Button>
          {(currentFilters.q || currentFilters.source) && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
              onClick={() => { setSearch(""); startTransition(() => router.push("/helpdesk/contacts")); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Gesamt", value: contacts.length, icon: Users },
          { label: "Freitext", value: contacts.filter((c) => c.source === "manual").length, icon: Edit2 },
          { label: "Active Directory", value: contacts.filter((c) => c.source === "ad").length, icon: Database },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
            <s.icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Users className="h-10 w-10 opacity-30" />
          <p className="text-sm">Keine Kontakte gefunden</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">E-Mail</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Telefon</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Firma / Abteilung</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quelle</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Tickets</th>
                <th className="px-4 py-2.5 w-20" aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contacts.map((c) => {
                const isEditing = editId === c.id;
                const src = SOURCE_LABELS[c.source] ?? { label: c.source, color: "bg-muted text-muted-foreground" };
                return (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <Input value={editData.name ?? ""} onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))}
                          className="h-7 text-xs" autoFocus />
                      ) : (
                        <p className="font-medium text-foreground">{c.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      {isEditing ? (
                        <Input value={editData.email ?? ""} onChange={(e) => setEditData((d) => ({ ...d, email: e.target.value }))}
                          className="h-7 text-xs" type="email" />
                      ) : (
                        c.email ? (
                          <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                            <Mail className="h-3 w-3" />{c.email}
                          </a>
                        ) : <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      {isEditing ? (
                        <Input value={editData.phone ?? ""} onChange={(e) => setEditData((d) => ({ ...d, phone: e.target.value }))}
                          className="h-7 text-xs" />
                      ) : (
                        c.phone ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />{c.phone}
                          </span>
                        ) : <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Input value={editData.company ?? ""} onChange={(e) => setEditData((d) => ({ ...d, company: e.target.value }))}
                            placeholder="Firma" className="h-7 text-xs w-28" />
                          <Input value={editData.department ?? ""} onChange={(e) => setEditData((d) => ({ ...d, department: e.target.value }))}
                            placeholder="Abt." className="h-7 text-xs w-24" />
                        </div>
                      ) : (
                        <span className="flex items-center gap-1">
                          {c.company && <><Building2 className="h-3 w-3 shrink-0" />{c.company}</>}
                          {c.department && <span className="text-muted-foreground/60">· {c.department}</span>}
                          {!c.company && !c.department && "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${src.color}`}>
                        {c.source === "ad" && <Database className="h-2.5 w-2.5 mr-1" />}
                        {src.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Link href={`/helpdesk?view=list&q=${encodeURIComponent(c.email ?? c.name)}`}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors">
                        {c._count.tickets}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {isEditing ? (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-500" onClick={() => saveEdit(c.id)} disabled={isPending}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(c.id, c.name)} disabled={isPending}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
