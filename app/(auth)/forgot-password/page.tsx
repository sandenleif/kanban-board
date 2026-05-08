import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Passwort vergessen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gib deine E-Mail ein — wir senden dir einen Reset-Link.
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted-foreground mt-6">
        <Link href="/login" className="text-primary hover:underline font-medium">
          Zurück zum Login
        </Link>
      </p>
    </div>
  );
}
