import Link from "next/link";
import { ResetPasswordForm } from "@/components/forms/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 shadow-2xl text-center">
        <p className="text-destructive font-medium mb-4">Ungültiger Reset-Link.</p>
        <Link href="/forgot-password" className="text-primary hover:underline text-sm">
          Neuen Link anfordern
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Neues Passwort</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Wähle ein neues Passwort für dein Konto.
        </p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  );
}
