"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight,
  Minus, Plus, Trash2, Edit2, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  createPersonalChecklistCategoryAction,
  updatePersonalChecklistCategoryAction,
  deletePersonalChecklistCategoryAction,
  createPersonalChecklistItemAction,
  updatePersonalChecklistItemAction,
  deletePersonalChecklistItemAction,
  createPersonalChecklistSubItemAction,
  updatePersonalChecklistSubItemAction,
  deletePersonalChecklistSubItemAction,
} from "@/actions/checklist";
import type { ChecklistItemPriority } from "@prisma/client";

type SubItem = { id: string; title: string; description: string | null; completed: boolean; position: number };
type Item = { id: string; title: string; priority: ChecklistItemPriority; position: number; subItems: SubItem[] };
type Category = { id: string; name: string; position: number; items: Item[] };

const PRIORITIES: { value: ChecklistItemPriority; label: string; icon: React.ReactNode; cls: string }[] = [
  { value: "LOW", label: "Niedrig", icon: <ArrowDown className="h-3.5 w-3.5" />, cls: "text-blue-400" },
  { value: "MEDIUM", label: "Mittel", icon: <Minus className="h-3.5 w-3.5" />, cls: "text-yellow-400" },
  { value: "HIGH", label: "Hoch", icon: <ArrowUp className="h-3.5 w-3.5" />, cls: "text-orange-400" },
  { value: "URGENT", label: "Dringend", icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: "text-red-400" },
];

function PriorityBadge({ priority }: { priority: ChecklistItemPriority }) {
  const p = PRIORITIES.find((x) => x.value === priority)!;
  return <span className={cn("flex items-center gap-1 text-xs font-medium", p.cls)}>{p.icon}{p.label}</span>;
}

function PrioritySelect({ value, onChange }: { value: ChecklistItemPriority; onChange: (v: ChecklistItemPriority) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {PRIORITIES.map((p) => (
        <button key={p.value} type="button" onClick={() => onChange(p.value)}
          className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-xs border transition-colors",
            value === p.value ? cn("border-current bg-current/10", p.cls) : "border-border text-muted-foreground hover:border-current hover:text-foreground"
          )}>
          <span className={value === p.value ? p.cls : ""}>{p.icon}</span>{p.label}
        </button>
      ))}
    </div>
  );
}

export function PersonalChecklist({ categories: initial }: { categories: Category[] }) {
  const [categories, setCategories] = useState<Category[]>(initial);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(initial.map((c) => c.id)));
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [newItemByCat, setNewItemByCat] = useState<Record<string, { title: string; priority: ChecklistItemPriority }>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemData, setEditingItemData] = useState<{ title: string; priority: ChecklistItemPriority }>({ title: "", priority: "MEDIUM" });
  const [newSubByItem, setNewSubByItem] = useState<Record<string, { title: string; description: string }>>({});
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubData, setEditingSubData] = useState<{ title: string; description: string }>({ title: "", description: "" });

  const toggleCat = (id: string) => setExpandedCats((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleItem = (id: string) => setExpandedItems((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function addCategory() {
    if (!newCatName.trim()) return;
    startTransition(async () => {
      const res = await createPersonalChecklistCategoryAction(newCatName.trim());
      if (res.success && res.id) {
        setCategories((p) => [...p, { id: res.id!, name: newCatName.trim(), position: p.length, items: [] }]);
        setExpandedCats((p) => new Set([...p, res.id!]));
        setNewCatName("");
      }
    });
  }

  function saveEditCat(id: string) {
    if (!editingCatName.trim()) return;
    startTransition(async () => {
      await updatePersonalChecklistCategoryAction(id, editingCatName.trim());
      setCategories((p) => p.map((c) => c.id === id ? { ...c, name: editingCatName.trim() } : c));
      setEditingCatId(null);
    });
  }

  function deleteCat(id: string) {
    startTransition(async () => {
      await deletePersonalChecklistCategoryAction(id);
      setCategories((p) => p.filter((c) => c.id !== id));
    });
  }

  function addItem(categoryId: string) {
    const d = newItemByCat[categoryId];
    if (!d?.title.trim()) return;
    startTransition(async () => {
      const res = await createPersonalChecklistItemAction(categoryId, d.title.trim(), d.priority ?? "MEDIUM");
      if (res.success && res.id) {
        setCategories((p) => p.map((c) => c.id === categoryId ? { ...c, items: [...c.items, { id: res.id!, title: d.title.trim(), priority: d.priority ?? "MEDIUM", position: 0, subItems: [] }] } : c));
        setNewItemByCat((p) => ({ ...p, [categoryId]: { title: "", priority: "MEDIUM" } }));
      }
    });
  }

  function saveEditItem(itemId: string, categoryId: string) {
    startTransition(async () => {
      await updatePersonalChecklistItemAction(itemId, editingItemData);
      setCategories((p) => p.map((c) => c.id === categoryId ? { ...c, items: c.items.map((it) => it.id === itemId ? { ...it, ...editingItemData } : it) } : c));
      setEditingItemId(null);
    });
  }

  function deleteItem(itemId: string, categoryId: string) {
    startTransition(async () => {
      await deletePersonalChecklistItemAction(itemId);
      setCategories((p) => p.map((c) => c.id === categoryId ? { ...c, items: c.items.filter((it) => it.id !== itemId) } : c));
    });
  }

  function addSubItem(itemId: string, categoryId: string) {
    const d = newSubByItem[itemId];
    if (!d?.title.trim()) return;
    startTransition(async () => {
      const res = await createPersonalChecklistSubItemAction(itemId, d.title.trim(), d.description);
      if (res.success && res.id) {
        setCategories((p) => p.map((c) => c.id === categoryId ? { ...c, items: c.items.map((it) => it.id === itemId ? { ...it, subItems: [...it.subItems, { id: res.id!, title: d.title.trim(), description: d.description || null, completed: false, position: 0 }] } : it) } : c));
        setNewSubByItem((p) => ({ ...p, [itemId]: { title: "", description: "" } }));
      }
    });
  }

  function toggleSubItem(subId: string, itemId: string, categoryId: string, completed: boolean) {
    startTransition(async () => {
      await updatePersonalChecklistSubItemAction(subId, { completed });
      setCategories((p) => p.map((c) => c.id === categoryId ? { ...c, items: c.items.map((it) => it.id === itemId ? { ...it, subItems: it.subItems.map((s) => s.id === subId ? { ...s, completed } : s) } : it) } : c));
    });
  }

  function saveEditSub(subId: string, itemId: string, categoryId: string) {
    startTransition(async () => {
      await updatePersonalChecklistSubItemAction(subId, editingSubData);
      setCategories((p) => p.map((c) => c.id === categoryId ? { ...c, items: c.items.map((it) => it.id === itemId ? { ...it, subItems: it.subItems.map((s) => s.id === subId ? { ...s, title: editingSubData.title, description: editingSubData.description || null } : s) } : it) } : c));
      setEditingSubId(null);
    });
  }

  function deleteSub(subId: string, itemId: string, categoryId: string) {
    startTransition(async () => {
      await deletePersonalChecklistSubItemAction(subId);
      setCategories((p) => p.map((c) => c.id === categoryId ? { ...c, items: c.items.map((it) => it.id === itemId ? { ...it, subItems: it.subItems.filter((s) => s.id !== subId) } : it) } : c));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Neue Kategorie..." value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} className="h-8 text-sm" />
        <Button size="sm" onClick={addCategory} disabled={isPending || !newCatName.trim()}><Plus className="h-3.5 w-3.5 mr-1" /> Kategorie</Button>
      </div>

      {categories.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Kategorien.</p>}

      {categories.map((cat) => {
        const isExpanded = expandedCats.has(cat.id);
        return (
          <div key={cat.id} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
              <button type="button" onClick={() => toggleCat(cat.id)} className="text-muted-foreground hover:text-foreground">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {editingCatId === cat.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input value={editingCatName} onChange={(e) => setEditingCatName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEditCat(cat.id); if (e.key === "Escape") setEditingCatId(null); }} className="h-7 text-sm flex-1" autoFocus />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveEditCat(cat.id)}><Check className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingCatId(null)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <span className="flex-1 text-sm font-semibold">{cat.name}</span>
              )}
              <span className="text-xs text-muted-foreground">{cat.items.length}</span>
              {editingCatId !== cat.id && (
                <div className="flex gap-0.5">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}><Edit2 className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteCat(cat.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              )}
            </div>

            {isExpanded && (
              <div className="divide-y divide-border">
                {cat.items.map((item) => {
                  const isItemExpanded = expandedItems.has(item.id);
                  const completed = item.subItems.filter((s) => s.completed).length;
                  const total = item.subItems.length;
                  return (
                    <div key={item.id}>
                      <div className="flex items-center gap-2 px-4 py-2 hover:bg-muted/30">
                        <button type="button" onClick={() => toggleItem(item.id)} className="text-muted-foreground hover:text-foreground">
                          {isItemExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                        {editingItemId === item.id ? (
                          <div className="flex-1 space-y-1.5">
                            <Input value={editingItemData.title} onChange={(e) => setEditingItemData((p) => ({ ...p, title: e.target.value }))} className="h-7 text-sm" autoFocus />
                            <PrioritySelect value={editingItemData.priority} onChange={(v) => setEditingItemData((p) => ({ ...p, priority: v }))} />
                            <div className="flex gap-1">
                              <Button size="sm" className="h-6 text-xs" onClick={() => saveEditItem(item.id, cat.id)}>Speichern</Button>
                              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingItemId(null)}>Abbrechen</Button>
                            </div>
                          </div>
                        ) : (
                          <><span className="flex-1 text-sm font-medium">{item.title}</span><PriorityBadge priority={item.priority} />{total > 0 && <span className="text-xs text-muted-foreground">{completed}/{total}</span>}</>
                        )}
                        {editingItemId !== item.id && (
                          <div className="flex gap-0.5 ml-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingItemId(item.id); setEditingItemData({ title: item.title, priority: item.priority }); }}><Edit2 className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteItem(item.id, cat.id)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </div>

                      {isItemExpanded && (
                        <div className="bg-muted/20 px-8 py-2 space-y-1.5">
                          {item.subItems.map((sub) => (
                            <div key={sub.id} className="flex items-start gap-2">
                              <Checkbox checked={sub.completed} onCheckedChange={(v) => toggleSubItem(sub.id, item.id, cat.id, !!v)} className="mt-0.5" />
                              {editingSubId === sub.id ? (
                                <div className="flex-1 space-y-1">
                                  <Input value={editingSubData.title} onChange={(e) => setEditingSubData((p) => ({ ...p, title: e.target.value }))} className="h-7 text-sm" autoFocus />
                                  <Textarea value={editingSubData.description} onChange={(e) => setEditingSubData((p) => ({ ...p, description: e.target.value }))} placeholder="Beschreibung" className="min-h-[60px] text-xs" />
                                  <div className="flex gap-1">
                                    <Button size="sm" className="h-6 text-xs" onClick={() => saveEditSub(sub.id, item.id, cat.id)}>Speichern</Button>
                                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingSubId(null)}>Abbrechen</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex-1 min-w-0">
                                  <p className={cn("text-sm", sub.completed && "line-through text-muted-foreground")}>{sub.title}</p>
                                  {sub.description && <p className="text-xs text-muted-foreground mt-0.5">{sub.description}</p>}
                                </div>
                              )}
                              {editingSubId !== sub.id && (
                                <div className="flex gap-0.5 shrink-0">
                                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { setEditingSubId(sub.id); setEditingSubData({ title: sub.title, description: sub.description ?? "" }); }}><Edit2 className="h-3 w-3" /></Button>
                                  <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => deleteSub(sub.id, item.id, cat.id)}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              )}
                            </div>
                          ))}
                          <div className="space-y-1.5 pt-1">
                            <Input placeholder="Unterpunkt hinzufügen..." value={newSubByItem[item.id]?.title ?? ""} onChange={(e) => setNewSubByItem((p) => ({ ...p, [item.id]: { ...p[item.id], title: e.target.value, description: p[item.id]?.description ?? "" } }))} onKeyDown={(e) => e.key === "Enter" && addSubItem(item.id, cat.id)} className="h-7 text-xs" />
                            {newSubByItem[item.id]?.title && (
                              <><Textarea placeholder="Beschreibung" value={newSubByItem[item.id]?.description ?? ""} onChange={(e) => setNewSubByItem((p) => ({ ...p, [item.id]: { ...p[item.id], description: e.target.value } }))} className="min-h-[50px] text-xs" />
                              <Button size="sm" className="h-6 text-xs" onClick={() => addSubItem(item.id, cat.id)}><Plus className="h-3 w-3 mr-1" /> Hinzufügen</Button></>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="px-4 py-2 space-y-1.5">
                  <div className="flex gap-2">
                    <Input placeholder="Neuer Oberpunkt..." value={newItemByCat[cat.id]?.title ?? ""} onChange={(e) => setNewItemByCat((p) => ({ ...p, [cat.id]: { ...p[cat.id], title: e.target.value, priority: p[cat.id]?.priority ?? "MEDIUM" } }))} onKeyDown={(e) => e.key === "Enter" && addItem(cat.id)} className="h-7 text-sm flex-1" />
                    <Button size="sm" className="h-7 text-xs" onClick={() => addItem(cat.id)} disabled={!newItemByCat[cat.id]?.title?.trim()}><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                  {newItemByCat[cat.id]?.title && <PrioritySelect value={newItemByCat[cat.id]?.priority ?? "MEDIUM"} onChange={(v) => setNewItemByCat((p) => ({ ...p, [cat.id]: { ...p[cat.id], priority: v } }))} />}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
