import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "KanbanFlow – Leif Sanden",
  description: "A modern multi-user Kanban board for teams",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("kb_theme")?.value === "light" ? "light" : "dark";

  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={theme}>
      <body className={`${inter.variable} font-sans antialiased`}>
        <NextIntlClientProvider messages={messages} locale={locale}>
          {children}
          <Toaster
            theme={theme}
            position="bottom-right"
            toastOptions={{
              style:
                theme === "dark"
                  ? {
                      background: "hsl(224 71% 6%)",
                      border: "1px solid hsl(216 34% 17%)",
                      color: "hsl(213 31% 91%)",
                    }
                  : undefined,
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
