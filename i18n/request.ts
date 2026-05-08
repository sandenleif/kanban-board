import { getRequestConfig } from "next-intl/server";
import { prisma } from "@/lib/prisma";

export const SUPPORTED_LOCALES = ["en", "de", "fr", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export default getRequestConfig(async () => {
  let locale: string = "en";
  try {
    const settings = await prisma.appSettings.findFirst({
      select: { locale: true },
      orderBy: { updatedAt: "desc" },
    });
    if (settings?.locale && SUPPORTED_LOCALES.includes(settings.locale as Locale)) {
      locale = settings.locale;
    }
  } catch {
    // DB not yet ready → fall back to English
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
