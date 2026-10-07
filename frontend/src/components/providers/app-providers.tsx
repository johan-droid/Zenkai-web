"use client";

import type { ReactNode } from "react";

import { PWAProvider } from "@/components/providers/pwa-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PWAProvider>
        <QueryProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="bottom-right" theme="dark" />
          </TooltipProvider>
        </QueryProvider>
      </PWAProvider>
    </ThemeProvider>
  );
}
