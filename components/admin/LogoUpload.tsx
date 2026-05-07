"use client";

import { useTransition, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { uploadLogoAction, removeLogoAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, Trash2, ImageIcon, Loader2 } from "lucide-react";

interface LogoUploadProps {
  currentLogo?: { logoBase64: string | null; logoMimeType: string | null } | null;
}

export function LogoUpload({ currentLogo }: LogoUploadProps) {
  const t = useTranslations("admin");
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(
    currentLogo?.logoBase64 && currentLogo?.logoMimeType
      ? `data:${currentLogo.logoMimeType};base64,${currentLogo.logoBase64}`
      : null
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Only image files are allowed"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Max file size is 2 MB"); return; }

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.set("logo", file);

    startTransition(async () => {
      const result = await uploadLogoAction(formData);
      if (result.error) { toast.error(result.error); setPreview(null); }
      else { toast.success(t("logoUpdated")); router.refresh(); }
    });
  };

  const handleRemove = () => {
    if (!confirm(t("logoConfirmRemove"))) return;
    startTransition(async () => {
      const result = await removeLogoAction();
      if (result.error) toast.error(result.error);
      else { setPreview(null); toast.success(t("logoRemoved")); router.refresh(); }
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{t("logoTitle")}</CardTitle>
        <CardDescription>{t("logoDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="w-32 h-16 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
            {preview ? (
              <img src={preview} alt="Company logo" className="max-w-full max-h-full object-contain p-2" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {preview ? t("logoReplace") : t("logoUpload")}
            </Button>
            {preview && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleRemove} disabled={isPending}>
                <Trash2 className="h-4 w-4" />
                {t("logoRemove")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
