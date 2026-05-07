import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/forms/LoginForm";

export default async function LoginPage() {
  const t = await getTranslations("login");

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground mt-6">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-primary hover:underline font-medium">
          {t("createOne")}
        </Link>
      </p>
    </div>
  );
}
