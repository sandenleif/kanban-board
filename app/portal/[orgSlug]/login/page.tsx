export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/portal-auth";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { notFound } from "next/navigation";

export default async function PortalLoginPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: {
      id: true, name: true, status: true, slug: true,
      settings: { select: { logoBase64: true, logoMimeType: true, siteTitle: true } },
      ldapConfig: { select: { enabled: true } },
    },
  });

  if (!org || org.status !== "ACTIVE") notFound();

  // Already logged in → redirect to portal
  const session = await getPortalSession();
  if (session?.orgSlug === orgSlug) redirect(`/portal/${orgSlug}`);

  const logoSrc = org.settings?.logoBase64 && org.settings.logoMimeType
    ? `data:${org.settings.logoMimeType};base64,${org.settings.logoBase64}`
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {logoSrc ? (
            <img src={logoSrc} alt={org.name} className="h-12 mx-auto mb-4 object-contain" />
          ) : (
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="text-white">
                  <rect x="1" y="1" width="5" height="14" rx="1" fill="currentColor" />
                  <rect x="8" y="1" width="5" height="9" rx="1" fill="currentColor" opacity="0.7" />
                </svg>
              </div>
            </div>
          )}
          <h1 className="text-2xl font-bold text-foreground">{org.settings?.siteTitle ?? org.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">Kundenportal</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-foreground mb-1">Anmelden</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {org.ldapConfig?.enabled
              ? "Melden Sie sich mit Ihrem Netzwerkkonto oder Portal-Passwort an."
              : "Melden Sie sich mit Ihren Portal-Zugangsdaten an."}
          </p>
          <PortalLoginForm orgSlug={orgSlug} />
        </div>
      </div>
    </div>
  );
}
