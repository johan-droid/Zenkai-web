import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Zenkai",
  description: "Modern anime and manga platform",
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
