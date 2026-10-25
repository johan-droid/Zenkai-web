/**
 * Canonical client API for user authentication, library, and cross-device sync.
 *
 * All credentials and session cookies are managed via HttpOnly secure cookies
 * and standard Fetch credentials ("include").
 */

import { fetchJson, type JsonRequestOptions } from "./http";
import { getZenkaiApiUrl } from "./zenkai";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionResponse {
  user: UserProfile;
  token?: string;
}

export interface CheckUsernameResponse {
  available: boolean;
  suggestions: string[];
}

export interface UserLibraryItem {
  id: string;
  userId: string;
  kind: "anime" | "manga" | "novel";
  mediaId: string;
  status: "watching" | "plan" | "completed" | "dropped";
  rating: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserLibraryResponse {
  items: UserLibraryItem[];
  counts: {
    watching: number;
    plan: number;
    completed: number;
    dropped: number;
    total: number;
  };
}

export interface UserProgressItem {
  id: string;
  userId: string;
  kind: "anime" | "manga" | "novel";
  mediaId: string;
  unit: number;
  positionSeconds: number;
  durationSeconds: number | null;
  page: number | null;
  totalUnits: number | null;
  completed: boolean;
  updatedAt: string;
}

export interface ContinueRailItem {
  mediaId: string;
  kind: string;
  unit: number;
  positionSeconds: number;
  durationSeconds: number | null;
  page: number | null;
  totalUnits: number | null;
  completed: boolean;
  fraction: number;
  updatedAt: string;
}

export interface SyncPayload {
  library?: Array<{
    kind: string;
    mediaId: string;
    status: string;
    rating?: number | null;
    notes?: string | null;
    updatedAt: string;
  }>;
  progress?: Array<{
    kind: string;
    mediaId: string;
    unit: number;
    positionSeconds: number;
    durationSeconds?: number | null;
    page?: number | null;
    totalUnits?: number | null;
    completed?: boolean;
    updatedAt: string;
  }>;
}

export interface SyncResponse {
  syncedAt: string;
  updated: {
    library: number;
    progress: number;
  };
  skipped: {
    library: number;
    progress: number;
  };
}

function authedFetch<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
  const base = getZenkaiApiUrl();
  const url = `${base}${path}`;
  return fetchJson<T>(url, {
    ...options,
    credentials: "include", // Ensure session cookies are sent
  });
}

/**
 * Register a new user account.
 */
export async function registerAccount(input: {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}): Promise<AuthSessionResponse> {
  return authedFetch<AuthSessionResponse>("/api/v1/auth/register", {
    method: "POST",
    body: input,
  });
}

/**
 * Log into an existing account with username/email and password.
 */
export async function loginAccount(input: {
  login: string;
  password: string;
}): Promise<AuthSessionResponse> {
  return authedFetch<AuthSessionResponse>("/api/v1/auth/login", {
    method: "POST",
    body: input,
  });
}

/**
 * Log out and invalidate the active session.
 */
export async function logoutAccount(): Promise<{ success: boolean }> {
  return authedFetch<{ success: boolean }>("/api/v1/auth/logout", {
    method: "POST",
  });
}

/**
 * Fetch the currently authenticated user, or null if unauthenticated.
 */
export async function fetchCurrentUser(): Promise<UserProfile | null> {
  try {
    const res = await authedFetch<{ user: UserProfile }>("/api/v1/auth/me", {
      method: "GET",
    });
    return res.user;
  } catch {
    return null;
  }
}

/**
 * Check if a username is available.
 */
export async function checkUsername(username: string): Promise<CheckUsernameResponse> {
  return authedFetch<CheckUsernameResponse>("/api/v1/auth/check-username", {
    method: "GET",
    params: { username },
  });
}

/**
 * Update user profile details.
 */
export async function updateUserProfile(updates: {
  displayName?: string;
  bio?: string;
  avatarUrl?: string | null;
}): Promise<UserProfile> {
  const res = await authedFetch<{ user: UserProfile }>("/api/v1/auth/profile", {
    method: "PATCH",
    body: updates,
  });
  return res.user;
}

/**
 * Fetch authenticated user's remote library.
 */
export async function fetchRemoteLibrary(filters?: {
  kind?: string;
  status?: string;
}): Promise<UserLibraryResponse> {
  return authedFetch<UserLibraryResponse>("/api/v1/user/library", {
    method: "GET",
    params: filters as Record<string, string>,
  });
}

/**
 * Save or update a single library entry remotely.
 */
export async function saveRemoteLibraryEntry(
  kind: string,
  mediaId: string,
  entry: {
    status: string;
    rating?: number | null;
    notes?: string | null;
  },
): Promise<{ entry: UserLibraryItem }> {
  return authedFetch<{ entry: UserLibraryItem }>(
    `/api/v1/user/library/${encodeURIComponent(kind)}/${encodeURIComponent(mediaId)}`,
    {
      method: "PUT",
      body: entry,
    },
  );
}

/**
 * Delete a library entry remotely.
 */
export async function deleteRemoteLibraryEntry(
  kind: string,
  mediaId: string,
): Promise<{ deleted: boolean }> {
  return authedFetch<{ deleted: boolean }>(
    `/api/v1/user/library/${encodeURIComponent(kind)}/${encodeURIComponent(mediaId)}`,
    {
      method: "DELETE",
    },
  );
}

/**
 * Fetch authenticated user's remote progress.
 */
export async function fetchRemoteProgress(query?: {
  kind?: string;
  mediaId?: string;
}): Promise<{ items: UserProgressItem[] }> {
  return authedFetch<{ items: UserProgressItem[] }>("/api/v1/user/progress", {
    method: "GET",
    params: query as Record<string, string>,
  });
}

/**
 * Fetch continue watching/reading rail computed on the server.
 */
export async function fetchRemoteContinue(kind = "anime"): Promise<{ entries: ContinueRailItem[] }> {
  return authedFetch<{ entries: ContinueRailItem[] }>("/api/v1/user/continue", {
    method: "GET",
    params: { kind },
  });
}

/**
 * Save watch/read unit progress remotely.
 */
export async function saveRemoteProgress(
  kind: string,
  mediaId: string,
  unit: number,
  data: {
    positionSeconds: number;
    durationSeconds?: number | null;
    page?: number | null;
    totalUnits?: number | null;
    completed?: boolean;
  },
): Promise<{ entry: UserProgressItem }> {
  return authedFetch<{ entry: UserProgressItem }>(
    `/api/v1/user/progress/${encodeURIComponent(kind)}/${encodeURIComponent(mediaId)}/${unit}`,
    {
      method: "PUT",
      body: data,
    },
  );
}

/**
 * Unified bi-directional cloud synchronization with Last-Write-Wins (LWW) conflict handling.
 */
export async function syncUserData(payload: SyncPayload): Promise<SyncResponse> {
  return authedFetch<SyncResponse>("/api/v1/user/sync", {
    method: "POST",
    body: payload,
  });
}

/**
 * Fetch public user profile and stats.
 */
export async function fetchPublicProfile(username: string): Promise<{ user: UserProfile }> {
  return authedFetch<{ user: UserProfile }>(`/api/v1/users/${encodeURIComponent(username)}`, {
    method: "GET",
  });
}
