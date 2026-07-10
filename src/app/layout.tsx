import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import "./globals.css";
import { cn } from "@/lib/utils";
import { GUEST_SETTINGS_STORAGE_KEY } from "@/lib/guest-settings";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HiFly",
  description: "HiFly",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Das theme-Cookie ist reine Render-Optimierung gegen Flackern (FOUC),
  // nicht die Quelle der Wahrheit — die ist localStorage (Gast) bzw.
  // user_settings (eingeloggt), siehe src/app/settings/actions.ts.
  const cookieStore = await cookies();
  const isDark = cookieStore.get("theme")?.value !== "light";

  return (
    <html lang="de" className={cn("h-full", "antialiased", isDark && "dark", inter.variable, "font-sans")}>
      <body className="min-h-full bg-background text-foreground">
        <Script id="guest-theme-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                function readCookie(name) {
                  var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
                  return match ? decodeURIComponent(match[1]) : null;
                }
                var stored = JSON.parse(localStorage.getItem(${JSON.stringify(GUEST_SETTINGS_STORAGE_KEY)}) || "{}");
                // Cookie gewinnt: für eingeloggte User ist es die einzige
                // clientseitig verfügbare, stets aktuelle Quelle (DB-Wert
                // wird bei jeder Änderung ins Cookie gespiegelt); localStorage
                // dient nur als Fallback vor dem allerersten Cookie.
                var theme = readCookie("theme") || stored.theme;
                if (theme === "light") document.documentElement.classList.remove("dark");
                else if (theme === "dark") document.documentElement.classList.add("dark");
                else if (theme === "system") {
                  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                  document.documentElement.classList.toggle("dark", prefersDark);
                }
              } catch (e) {}
            })();
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
