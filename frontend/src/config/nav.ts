import {
  BookOpen,
  CalendarDays,
  History,
  Home,
  Library,
  ScrollText,
  Settings,
  Tv,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar. */
  bottom?: boolean;
  description?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * Content discovery — the desktop header row and the footer's Explore group.
 * Personal destinations deliberately live behind the account menu so the
 * chrome reads as a streaming product rather than an admin toolbar.
 */
export const primaryNav: NavItem[] = [
  { label: "Home", href: "/", icon: Home, bottom: true, description: "Trending and new" },
  { label: "Anime", href: "/anime", icon: Tv, bottom: true, description: "Browse anime" },
  { label: "Manga", href: "/manga", icon: BookOpen, bottom: true, description: "Browse manga" },
  { label: "Novels", href: "/novel", icon: ScrollText, description: "Browse light novels" },
  { label: "Schedule", href: "/schedule", icon: CalendarDays, bottom: true, description: "Airing this week" },
  { label: "Library", href: "/library", icon: Library, bottom: true, description: "Lists and saved" },
];

/** Account-scoped destinations: the account menu, the drawer, the footer. */
export const personalNav: NavItem[] = [
  { label: "History", href: "/history", icon: History, description: "Recently watched" },
  { label: "Settings", href: "/settings", icon: Settings, description: "Preferences and data" },
];

/** Grouped list shared by the mobile drawer and the footer. */
export const navSections: NavSection[] = [
  { title: "Browse", items: primaryNav },
  { title: "You", items: personalNav },
];

/**
 * Bottom bar: the highest-value destinations only. Derived from `primaryNav`
 * so the bar and the header row cannot drift apart the way the old hardcoded
 * list did.
 */
export const bottomNav: NavItem[] = primaryNav.filter((item) => item.bottom);

/** Home only matches exactly; every other route matches its subtree. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Playback and reading routes where the shell must not compete with the
 * content. The bottom bar hides here and the header switches to its compact
 * variant.
 */
export function isImmersivePath(pathname: string): boolean {
  return (
    pathname.startsWith("/watch/") ||
    pathname.startsWith("/read/") ||
    pathname.startsWith("/read-novel/")
  );
}

/**
 * Immersive routes have no in-page back control, so the compact header needs
 * somewhere real to send the user: the title the media belongs to.
 */
export function immersiveParentPath(pathname: string): string {
  const [, section, id] = pathname.split("/");
  if (section === "watch" && id) return `/anime/${id}`;
  if (section === "read" && id) return `/manga/${id}`;
  if (section === "read-novel" && id) return `/novel/${id}`;
  return "/";
}
