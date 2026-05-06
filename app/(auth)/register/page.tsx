import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RegisterForm } from "@/components/forms/RegisterForm";

export default async function RegisterPage() {
  const t = await getTranslations("register");

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>
      <RegisterForm />
      <p className="text-center text-sm text-muted-foreground mt-6">
        {t("hasAccount")}{" "}
        <Link href="/login" className="text-primary hover:underline font-medium">
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
