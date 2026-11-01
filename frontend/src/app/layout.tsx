import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AppProviders } from "@/components/providers/app-providers";
import "@/app/globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  display: "swap",
  variable: "--font-archivo",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const viewport: Viewport = {
  themeColor: "#0b0a0a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "ZENKAI — Anime, Manga & Novels",
  description: "Stream anime, read manga and novels ad-free in high definition with CinePlayer.",
  referrer: "no-referrer",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ZENKAI",
  },
  icons: {
    icon: "/assets/zenkai-logo-transparent.svg",
    shortcut: "/assets/zenkai-logo-transparent.svg",
    apple: "/assets/zenkai-logo-transparent.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`dark ${archivo.variable}`}>
      <body className="min-h-dvh bg-surface-0 text-ink-1 antialiased">
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
