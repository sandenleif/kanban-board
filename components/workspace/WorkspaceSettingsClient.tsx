"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  updateWorkspaceAction,
  deleteWorkspaceAction,
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, UserMinus, UserPlus } from "lucide-react";
import { getInitials, ROLE_LABELS } from "@/lib/utils";
import type { WorkspaceRole } from "@prisma/client";

interface Member {
  id: string;
  role: WorkspaceRole;
  user: { id: string; name: string; email: string };
}

interface WorkspaceSettingsClientProps {
  workspace: { id: string; name: string; description: string | null };
  members: Member[];
  currentUserId: string;
  userRole: WorkspaceRole;
  canAdmin: boolean;
}

export function WorkspaceSettingsClient({
  workspace,
  members: initialMembers,
  currentUserId,
  userRole,
  canAdmin,
}: WorkspaceSettingsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [members, setMembers] = useState(initialMembers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("MEMBER");
  const [inviteError, setInviteError] = useState("");

  const handleUpdateWorkspace = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateWorkspaceAction(workspace.id, formData);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Workspace updated");
        router.refresh();
      }
    });
  };

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    setInviteError("");
    const formData = new FormData();
    formData.set("email", inviteEmail.trim());
    formData.set("role", inviteRole);

    startTransition(async () => {
      const result = await inviteMemberAction(workspace.id, {}, formData);
      if (result.error) {
        setInviteError(result.error);
      } else {
        toast.success("Member invited");
        setInviteEmail("");
        router.refresh();
      }
    });
  };

  const handleRemoveMember = (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from workspace?`)) return;
    startTransition(async () => {
      const result = await removeMemberAction(workspace.id, memberId);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Member removed");
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    });
  };

  const handleRoleChange = (memberId: string, role: string) => {
    startTransition(async () => {
      const result = await updateMemberRoleAction(workspace.id, memberId, role);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Role updated");
        setMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, role: role as WorkspaceRole } : m))
        );
      }
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `Delete workspace "${workspace.name}"? ALL data (projects, tasks, comments) will be permanently deleted.`
      )
    )
      return;
    startTransition(async () => {
      await deleteWorkspaceAction(workspace.id);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Update workspace name and description.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleUpdateWorkspace} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Workspace name</Label>
              <Input
                id="ws-name"
                name="name"
                defaultValue={workspace.name}
                disabled={!canAdmin}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-desc">Description</Label>
              <Textarea
                id="ws-desc"
                name="description"
                defaultValue={workspace.description ?? ""}
                rows={3}
                disabled={!canAdmin}
              />
            </div>
            {canAdmin && (
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="animate-spin" />}
                Save changes
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Manage who has access to this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canAdmin && (
            <div className="mb-6">
              <p className="text-sm font-medium mb-2">Invite member</p>
              <div className="flex gap-2">
                <Input
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  className="flex-1"
                />
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleInvite} disabled={isPending}>
                  <UserPlus className="h-4 w-4" />
                  Invite
                </Button>
              </div>
              {inviteError && (
                <p className="text-sm text-destructive mt-1.5">{inviteError}</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs bg-primary/20 text-primary">
                      {getInitials(member.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {member.user.name}
                      {member.user.id === currentUserId && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.user.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canAdmin && member.role !== "OWNER" && member.user.id !== currentUserId ? (
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleRoleChange(member.id, v)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground px-2">
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}

                  {canAdmin && member.role !== "OWNER" && member.user.id !== currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveMember(member.id, member.user.name)}
                      disabled={isPending}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {userRole === "OWNER" && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              These actions are irreversible. Proceed with caution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4" />
              Delete workspace
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
