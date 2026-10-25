/**
 * Device-Specific Preferences (Phase 3 & Milestone E).
 *
 * All display, animation, density, and reader orientation preferences
 * are stored strictly in client device storage (localStorage). They NEVER
 * synchronize to the remote PostgreSQL database, ensuring that display choices
 * on one browser or device do not unexpectedly leak across to another.
 */

export type CardDensity = "comfortable" | "compact";
export type ReaderLayout = "rtl" | "ltr" | "vertical";
export type MotionPreference = "system" | "reduced" | "full";

export const DENSITY_KEY = "zenkai_pref_card_density";
export const READER_LAYOUT_KEY = "zenkai_pref_reader_layout";
export const MOTION_KEY = "zenkai_pref_motion";

export interface DevicePreferences {
  cardDensity: CardDensity;
  readerLayout: ReaderLayout;
  motionPreference: MotionPreference;
}

export const DEFAULT_PREFERENCES: DevicePreferences = {
  cardDensity: "comfortable",
  readerLayout: "rtl", // Manga standard
  motionPreference: "system",
};

export function getDevicePreferences(): DevicePreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };

  const density = (localStorage.getItem(DENSITY_KEY) as CardDensity) || DEFAULT_PREFERENCES.cardDensity;
  const reader = (localStorage.getItem(READER_LAYOUT_KEY) as ReaderLayout) || DEFAULT_PREFERENCES.readerLayout;
  const motion = (localStorage.getItem(MOTION_KEY) as MotionPreference) || DEFAULT_PREFERENCES.motionPreference;

  return {
    cardDensity: density === "compact" ? "compact" : "comfortable",
    readerLayout: ["rtl", "ltr", "vertical"].includes(reader) ? reader : "rtl",
    motionPreference: ["system", "reduced", "full"].includes(motion) ? motion : "system",
  };
}

export function setCardDensity(density: CardDensity): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DENSITY_KEY, density);
  document.documentElement.dataset.density = density;
}

export function setReaderLayout(layout: ReaderLayout): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(READER_LAYOUT_KEY, layout);
}

export function setMotionPreference(motion: MotionPreference): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MOTION_KEY, motion);
  applyMotionPreference(motion);
}

export function applyMotionPreference(motion: MotionPreference): void {
  if (typeof window === "undefined") return;
  if (motion === "reduced") {
    document.documentElement.classList.add("reduce-motion");
  } else if (motion === "full") {
    document.documentElement.classList.remove("reduce-motion");
  } else {
    // System: check window.matchMedia
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }
  }
}
