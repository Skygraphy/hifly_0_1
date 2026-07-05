import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HiFly",
  description: "HiFly",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={cn("h-full", "antialiased", "dark", inter.variable, "font-sans")}>
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
