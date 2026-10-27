/** Canonical client API for user authentication, library, and cross-device sync. */
/* ... (existing content) ... */

export interface UserSettings {
  defaultServer?: string;
  subtitleLanguage?: string;
  theme?: "dark" | "light" | "system";
  cardDensity?: "comfortable" | "compact";
  readerLayout?: "rtl" | "ltr" | "vertical";
  motionPreference?: "system" | "reduced" | "full";
}

/** Fetch the currently authenticated user's settings. */
export async function fetchUserSettings(): Promise<UserSettings> {
  try {
    const res = await authedFetch<UserSettings>("/api/v1/auth/settings", {
      method: "GET",
    });
    return res;
  } catch {
    return {};
  }
}

/** Update authenticated user's settings. */
export async function updateUserSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
  const res = await authedFetch<UserSettings>("/api/v1/auth/settings", {
    method: "PATCH",
    body: updates,
  });
  return res;
}

/** Fetch authenticated user's remote library. */
/* ... (rest of existing content) ... */