"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PWAContextType {
  isInstallable: boolean;
  isStandalone: boolean;
  installPWA: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType>({
  isInstallable: false,
  isStandalone: false,
  installPWA: async () => {},
});

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running in standalone display mode (PWA installed)
    const checkStandalone = () => {
      const isStandaloneMode =
        (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) ||
        (typeof window !== "undefined" && (window.navigator as unknown as { standalone?: boolean }).standalone === true);
      setIsStandalone(Boolean(isStandaloneMode));
    };

    checkStandalone();

    // Listen for display mode changes
    let mql: MediaQueryList | null = null;
    const handleMqlChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
      if (e.matches) {
        setIsInstallable(false);
        setDeferredPrompt(null);
      }
    };

    if (typeof window !== "undefined" && window.matchMedia) {
      mql = window.matchMedia("(display-mode: standalone)");
      mql.addEventListener?.("change", handleMqlChange);
    }

    // Register Service Worker in production
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("[PWA] ServiceWorker registered with scope:", registration.scope);
          })
          .catch((error) => {
            console.warn("[PWA] ServiceWorker registration failed:", error);
          });
      });
    }

    // Capture beforeinstallprompt event when deferred installation is supported
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      toast.success("Zenkai App installed successfully!");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (mql && mql.removeEventListener) {
        mql.removeEventListener("change", handleMqlChange);
      }
    };
  }, []);

  const installPWA = async () => {
    const promptEvent = deferredPrompt;
    if (!promptEvent) return;

    // Single-use: Clear event reference so it cannot be invoked more than once
    setDeferredPrompt(null);
    setIsInstallable(false);

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setIsStandalone(true);
        toast.success("Zenkai App installation accepted!");
      } else {
        toast.info("App installation dismissed.");
      }
    } catch (error) {
      console.warn("[PWA] Installation failed:", error);
      toast.error("Could not complete app installation.");
    }
  };

  return (
    <PWAContext.Provider value={{ isInstallable, isStandalone, installPWA }}>
      {children}
    </PWAContext.Provider>
  );
}

export const usePWA = () => useContext(PWAContext);
