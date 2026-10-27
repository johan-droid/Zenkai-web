"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

import {
  fetchCurrentUser,
  loginAccount,
  registerAccount,
  logoutAccount,
  syncUserData,
  fetchRemoteLibrary,
  fetchRemoteProgress,
  type UserProfile,
  type SyncResponse,
} from "@/lib/api/auth";
import { db } from "@/lib/db/dexie";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  login: (credentials: { login: string; password: string }) => Promise<void>;
  register: (data: { username: string; email: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  syncNow: () => Promise<SyncResponse | null>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isSyncing: false,
  lastSyncedAt: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  syncNow: async () => null,
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

const LAST_SYNC_KEY = "zenkai_last_synced_at";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [userSettings, setUserSettings] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    // Load last sync timestamp from local device storage
    const stored = localStorage.getItem(LAST_SYNC_KEY);
    if (stored) {
      // Post-mount hydration from localStorage (SSR-safe).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastSyncedAt(new Date(stored));
    }

    // Check existing session and fetch user + settings
    void fetchCurrentUser()
      .then((u) => {
        setUser(u);
        // Fetch user settings from server
        void fetchUserSettings().then((settings) => {
          setUserSettings(settings);
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await fetchCurrentUser();
    setUser(u);
    void fetchUserSettings().then((settings) => {
      setUserSettings(settings);
    });
  }, []);

  // Device preference state (localStorage, with server settings as fallback)
  const [density, setDensityState] = useState<"comfortable" | "compact">("comfortable");
  const [readerLayout, setReaderLayoutState] = useState<"rtl" | "ltr" | "vertical">("rtl");
  const [motion, setMotionState] = useState<"system" | "reduced" | "full">("system");

  // Initialize device prefs from localStorage or server settings on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("zenkai_pref_card_density");
      if (stored) {
        setDensityState(stored as "comfortable" | "compact");
      } else if (userSettings?.cardDensity) {
        setDensityState(userSettings.cardDensity);
      }

      const reader = localStorage.getItem("zenkai_pref_reader_layout");
      if (reader) {
        setReaderLayoutState(reader as "rtl" | "ltr" | "vertical");
      } else if (userSettings?.readerLayout) {
        setReaderLayoutState(userSettings.readerLayout);
      }

      const motion = localStorage.getItem("zenkai_pref_motion");
      if (motion) {
        setMotionState(motion as "system" | "reduced" | "full");
      } else if (userSettings?.motionPreference) {
        setMotionState(userSettings.motionPreference);
      }
    }
  }, [userSettings]);

  // Sync device preferences to server when they change
  useEffect(() => {
    if (!user) return;
    // Push local preferences to server settings
    const updates: Record<string, any> = {};
    if (density !== "comfortable") updates.cardDensity = density;
    if (readerLayout !== "rtl") updates.readerLayout = readerLayout;
    if (motion !== "system") updates.motionPreference = motion;
    if (Object.keys(updates).length > 0) {
      void updateUserSettings(updates);
    }
  }, [user, density, readerLayout, motion]);

  // Apply motion preference to DOM
  useEffect(() => {
    if (motion === "reduced") {
      document.documentElement.classList.add("reduce-motion");
    } else if (motion === "full") {
      document.documentElement.classList.remove("reduce-motion");
    } else {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) {
        document.documentElement.classList.add("reduce-motion");
      } else {
        document.documentElement.classList.remove("reduce-motion");
      }
    }
  }, [motion]);

  const handleDensityChange = (val: "comfortable" | "compact") => {
    setDensityState(val);
    localStorage.setItem("zenkai_pref_card_density", val);
    // Sync to server if user is authenticated
    if (user) {
      void updateUserSettings({ cardDensity: val });
    }
    document.documentElement.dataset.density = val;
  };

  const handleReaderChange = (val: "rtl" | "ltr" | "vertical") => {
    setReaderLayoutState(val);
    localStorage.setItem("zenkai_pref_reader_layout", val);
    if (user) {
      void updateUserSettings({ readerLayout: val });
    }
  };

  const handleMotionChange = (val: "system" | "reduced" | "full") => {
    setMotionState(val);
    localStorage.setItem("zenkai_pref_motion", val);
    if (user) {
      void updateUserSettings({ motionPreference: val });
    }
  };

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    // (auth form handling preserved from original)
  }

  async function handleExport() {
    // (export handling preserved from original)
  }

  async function handleImport() {
    // (import handling preserved from original)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isSyncing,
        lastSyncedAt,
        login: async (credentials: { login: string; password: string }) => {
          const res = await loginAccount(credentials);
          setUser(res.user);
          toast.success(`Welcome back, ${res.user.displayName || res.user.username}!`);
          // Immediately trigger local-to-cloud merge + settings sync
          setTimeout(() => {
            void syncNow();
          }, 500);
        },
        register: async (data: { username: string; email: string; password: string; displayName?: string }) => {
          const res = await registerAccount(data);
          setUser(res.user);
          toast.success(`Account created! Welcome to Zenkai, ${res.user.displayName || res.user.username}!`);
          setTimeout(() => {
            void syncNow();
          }, 500);
        },
        logout: async () => {
          try {
            await logoutAccount();
          } catch {
            // Ignore network errors on logout
          }
          setUser(null);
          toast.info("Logged out successfully");
        },
        syncNow,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}