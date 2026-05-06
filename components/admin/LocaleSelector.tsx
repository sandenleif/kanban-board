"use client";

import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateLocaleAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Globe, Loader2 } from "lucide-react";

const LOCALES = [
  { code: "en", label: "English",  flag: "🇬🇧" },
  { code: "de", label: "Deutsch",  flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español",  flag: "🇪🇸" },
];

export function LocaleSelector({ currentLocale }: { currentLocale: string }) {
  const t = useTranslations("admin");
  const [selected, setSelected] = useState(currentLocale);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateLocaleAction(selected);
      if (result.error) toast.error(result.error);
      else {
        toast.success(t("languageSaved"));
        window.location.reload();
      }
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          {t("languageTitle")}
        </CardTitle>
        <CardDescription>{t("languageDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.label}
              </option>
            ))}
          </select>
          <Button onClick={handleSave} disabled={isPending || selected === currentLocale}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("languageSave")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
