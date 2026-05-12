"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2, Tag, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  createTicketTeamAction, deleteTicketTeamAction,
  createTicketCategoryAction, deleteTicketCategoryAction,
} from "@/actions/ticket";
import { toast } from "sonner";

type Item = { id: string; name: string };

function ManagedList({
  title, description, icon, items: initial,
  onCreate, onDelete,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  items: Item[];
  onCreate: (name: string) => Promise<{ success?: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ success?: boolean; error?: string }>;
}) {
  const [items, setItems] = useState(initial);
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    if (!newName.trim()) return;
    startTransition(async () => {
      const r = await onCreate(newName.trim());
      if (r.error) { toast.error(r.error); return; }
      setItems((prev) => [...prev, { id: Date.now().toString(), name: newName.trim() }]);
      setNewName("");
      toast.success(`"${newName.trim()}" erstellt`);
      // Refresh to get real ID
      window.location.reload();
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    startTransition(async () => {
      const r = await onDelete(id);
      if (r.error) { toast.error(r.error); return; }
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success(`"${name}" gelöscht`);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}{title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder={`Neuer ${title.slice(0, -1)}…`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="flex-1"
            disabled={isPending}
          />
          <Button size="sm" onClick={handleCreate} disabled={isPending || !newName.trim()}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Hinzufügen
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Noch keine {title} angelegt</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm font-medium text-foreground">{item.name}</span>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(item.id, item.name)} disabled={isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HelpdeskAdminPanel({ teams, categories }: { teams: Item[]; categories: Item[] }) {
  return (
    <div className="space-y-4 mt-6">
      <h2 className="text-lg font-semibold text-foreground">Helpdesk-Verwaltung</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ManagedList
          title="Teams"
          description="Teams werden bei der Ticket-Erstellung und -Filterung verwendet."
          icon={<Users className="h-4 w-4 text-primary" />}
          items={teams}
          onCreate={createTicketTeamAction}
          onDelete={deleteTicketTeamAction}
        />
        <ManagedList
          title="Kategorien"
          description="Kategorien helfen Tickets zu klassifizieren. Nutzer wählen per Dropdown."
          icon={<Tag className="h-4 w-4 text-primary" />}
          items={categories}
          onCreate={createTicketCategoryAction}
          onDelete={deleteTicketCategoryAction}
        />
      </div>
    </div>
  );
}
