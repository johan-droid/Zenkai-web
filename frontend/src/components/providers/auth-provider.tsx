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

  useEffect(() => {
    // Load last sync timestamp from local device storage
    const stored = localStorage.getItem(LAST_SYNC_KEY);
    if (stored) {
      setLastSyncedAt(new Date(stored));
    }

    // Check existing session
    void fetchCurrentUser()
      .then((u) => {
        setUser(u);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await fetchCurrentUser();
    setUser(u);
  }, []);

  /**
   * Bi-directional cloud sync: pushes local Dexie data to server,
   * then fetches remote items and writes any newer records back to Dexie.
   */
  const syncNow = useCallback(async (): Promise<SyncResponse | null> => {
    if (!user) return null;
    setIsSyncing(true);

    try {
      // 1. Read local records from Dexie
      const localLib = await db.library.toArray();
      const localProg = await db.progress.toArray();

      const payload = {
        library: localLib.map((l) => ({
          kind: l.kind,
          mediaId: l.mediaId,
          status: l.status,
          updatedAt: new Date(l.updatedAt).toISOString(),
        })),
        progress: localProg.map((p) => ({
          kind: p.kind,
          mediaId: p.mediaId,
          unit: p.unit,
          positionSeconds: p.positionSeconds,
          durationSeconds: p.durationSeconds,
          page: p.page,
          totalUnits: p.totalUnits,
          completed: p.completed,
          updatedAt: new Date(p.updatedAt).toISOString(),
        })),
      };

      // 2. Push to server with LWW
      const syncResult = await syncUserData(payload);

      // 3. Pull latest remote state into local Dexie
      const remoteLib = await fetchRemoteLibrary();
      for (const item of remoteLib.items) {
        const local = await db.library.get(`${item.kind}:${item.mediaId}`);
        const remoteTime = new Date(item.updatedAt).getTime();
        if (!local || remoteTime > local.updatedAt) {
          await db.library.put({
            id: `${item.kind}:${item.mediaId}`,
            kind: item.kind as "anime" | "manga",
            mediaId: item.mediaId,
            title: item.mediaId, // Canonical reference
            coverUrl: null,
            status: item.status as "watching" | "plan" | "completed" | "dropped",
            updatedAt: remoteTime,
          });
        }
      }

      const remoteProg = await fetchRemoteProgress();
      for (const p of remoteProg.items) {
        const id = `${p.kind}:${p.mediaId}:${p.unit}`;
        const local = await db.progress.get(id);
        const remoteTime = new Date(p.updatedAt).getTime();
        if (!local || remoteTime > local.updatedAt) {
          await db.progress.put({
            id,
            kind: p.kind as "anime" | "manga",
            mediaId: p.mediaId,
            title: p.mediaId,
            coverUrl: null,
            unit: p.unit,
            positionSeconds: p.positionSeconds,
            durationSeconds: p.durationSeconds,
            page: p.page ?? undefined,
            totalUnits: p.totalUnits,
            completed: p.completed,
            updatedAt: remoteTime,
          });
        }
      }

      const now = new Date();
      setLastSyncedAt(now);
      localStorage.setItem(LAST_SYNC_KEY, now.toISOString());

      toast.success("Library & watch progress synchronized with cloud");
      return syncResult;
    } catch (err) {
      console.error("Cloud synchronization error:", err);
      toast.error("Failed to synchronize with cloud");
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [user]);

  const login = useCallback(
    async (credentials: { login: string; password: string }) => {
      const res = await loginAccount(credentials);
      setUser(res.user);
      toast.success(`Welcome back, ${res.user.displayName || res.user.username}!`);
      // Immediately trigger local-to-cloud merge
      setTimeout(() => {
        void syncNow();
      }, 500);
    },
    [syncNow],
  );

  const register = useCallback(
    async (data: { username: string; email: string; password: string; displayName?: string }) => {
      const res = await registerAccount(data);
      setUser(res.user);
      toast.success(`Account created! Welcome to Zenkai, ${res.user.displayName || res.user.username}!`);
      // Immediately trigger local-to-cloud merge
      setTimeout(() => {
        void syncNow();
      }, 500);
    },
    [syncNow],
  );

  const logout = useCallback(async () => {
    try {
      await logoutAccount();
    } catch {
      // Ignore network errors on logout
    }
    setUser(null);
    toast.info("Logged out successfully");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isSyncing,
        lastSyncedAt,
        login,
        register,
        logout,
        syncNow,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
