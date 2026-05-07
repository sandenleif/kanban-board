"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { setupAdminAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";

const LOCALES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
];

export function SetupForm() {
  const t = useTranslations("setup");
  const c = useTranslations("common");
  const [state, action, isPending] = useActionState(setupAdminAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">{c("fullName")}</Label>
        <Input id="name" name="name" placeholder={t("namePlaceholder")} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">{c("email")}</Label>
        <Input id="email" name="email" type="email" placeholder={t("emailPlaceholder")} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{c("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder={t("passwordHint")}
          minLength={8}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="locale">{t("languageLabel")}</Label>
        <select
          id="locale"
          name="locale"
          defaultValue="en"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t("languageHint")}</p>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        {t("submit")}
      </Button>
    </form>
  );
}
