import {
  BookOpen,
  CalendarDays,
  Compass,
  History,
  Home,
  Library,
  Settings,
  Tv,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar. */
  mobile?: boolean;
  description?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    items: [
      { label: "Home", href: "/", icon: Home, mobile: true, description: "Trending and new" },
      { label: "Anime", href: "/anime", icon: Tv, mobile: true, description: "Browse anime" },
      { label: "Manga", href: "/manga", icon: BookOpen, mobile: true, description: "Browse manga" },
      { label: "Discover", href: "/search", icon: Compass, description: "Search everything" },
    ],
  },
  {
    title: "Your stuff",
    items: [
      {
        label: "Library",
        href: "/library",
        icon: Library,
        mobile: true,
        description: "Lists and saved",
      },
      { label: "Schedule", href: "/schedule", icon: CalendarDays, description: "Airing this week" },
      { label: "History", href: "/history", icon: History, description: "Recently watched" },
      { label: "Settings", href: "/settings", icon: Settings, description: "Preferences and data" },
    ],
  },
];

export const primaryNav: NavItem[] = navSections.flatMap((section) => section.items);
export const mobileNav: NavItem[] = primaryNav.filter((item) => item.mobile);

/** Home only matches exactly; every other route matches its subtree. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
