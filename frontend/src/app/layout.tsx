import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import "@/app/globals.css";

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "ZENKAI — Anime, Manga & Novels",
  description: "Stream anime, read manga and novels ad-free in high definition with CinePlayer.",
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
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-purple-500/30">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
