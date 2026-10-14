"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Tv, BookOpen, CalendarDays, Library } from "lucide-react";

import { isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

const MOBILE_NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Anime", href: "/anime", icon: Tv },
  { label: "Manga", href: "/manga", icon: BookOpen },
  { label: "Schedule", href: "/schedule", icon: CalendarDays },
  { label: "Library", href: "/library", icon: Library },
];

export function MobileNav() {
  const pathname = usePathname();

  // Hide mobile bottom navigation during video playback and reading modes
  // to prevent overlapping player chrome, seek bar and fullscreen controls
  const isImmersiveMedia =
    pathname.startsWith("/watch/") ||
    pathname.startsWith("/read/") ||
    pathname.startsWith("/read-novel/");

  if (isImmersiveMedia) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden"
      aria-label="Mobile"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.68rem] font-medium transition-colors",
                active ? "text-white" : "text-zinc-400 hover:text-white",
              )}
            >
              {active && (
                <span className="absolute inset-x-3 top-1 bottom-1 rounded-xl bg-[#c8102e]/20 ring-1 ring-[#c8102e]/40" />
              )}
              <span className="relative z-10 flex flex-col items-center gap-1">
                <Icon className={cn("size-5", active ? "text-[#e52545]" : "text-zinc-400")} />
                <span>{item.label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
