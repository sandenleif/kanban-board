import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "KanbanFlow – Leif Sanden",
  description: "A modern multi-user Kanban board for teams",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("kb_theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="de" className={theme}>
      <body className={`${inter.variable} font-sans antialiased`}>
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
      </body>
    </html>
  );
}
