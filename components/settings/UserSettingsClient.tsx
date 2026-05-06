"use client";

import { useTransition, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { updateProfileAction, updatePasswordAction, uploadAvatarAction, removeAvatarAction } from "@/actions/user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { getInitials, formatDate } from "@/lib/utils";

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  avatarBase64: string | null;
  avatarMimeType: string | null;
}

export function UserSettingsClient({ user }: { user: User }) {
  const [isPending, startTransition] = useTransition();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user.avatarBase64 && user.avatarMimeType
      ? `data:${user.avatarMimeType};base64,${user.avatarBase64}`
      : null
  );
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleProfile = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateProfileAction(formData);
      if (result?.error) toast.error(result.error);
      else toast.success("Profile updated");
    });
  };

  const handlePassword = (formData: FormData) => {
    startTransition(async () => {
      const result = await updatePasswordAction(formData);
      if (result?.error) toast.error(result.error);
      else toast.success("Password changed");
    });
  };

  const handleAvatarFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Max file size is 2 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setAvatarPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.set("avatar", file);

    startTransition(async () => {
      const result = await uploadAvatarAction(formData);
      if (result.error) {
        toast.error(result.error);
        setAvatarPreview(null);
      } else {
        toast.success("Profile picture updated");
        router.refresh();
      }
    });
  };

  const handleAvatarRemove = () => {
    if (!confirm("Remove your profile picture?")) return;
    startTransition(async () => {
      const result = await removeAvatarAction();
      if (result.error) toast.error(result.error);
      else {
        setAvatarPreview(null);
        toast.success("Profile picture removed");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your personal information.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <Avatar className="h-16 w-16">
                {avatarPreview && <AvatarImage src={avatarPreview} alt={user.name} />}
                <AvatarFallback className="text-lg bg-primary/20 text-primary font-semibold">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {avatarPreview ? "Replace picture" : "Upload picture"}
              </Button>
              {avatarPreview && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleAvatarRemove}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG, GIF — max 2 MB</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Member since {formatDate(user.createdAt)}
              </p>
            </div>
          </div>

          <form action={handleProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" defaultValue={user.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={user.email}
                required
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handlePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
