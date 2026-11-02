"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Tv, BookOpen, CalendarDays, Bookmark } from "lucide-react";
import { motion } from "motion/react";

import { isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

const MOBILE_NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Anime", href: "/anime", icon: Tv },
  { label: "Manga", href: "/manga", icon: BookOpen },
  { label: "Schedule", href: "/schedule", icon: CalendarDays },
  { label: "Library", href: "/library", icon: Bookmark },
];

export function MobileNav() {
  const pathname = usePathname();

  const isImmersiveMedia =
    pathname.startsWith("/watch/") ||
    pathname.startsWith("/read/") ||
    pathname.startsWith("/read-novel/");

  if (isImmersiveMedia) return null;

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 md:hidden",
        "pb-[env(safe-area-inset-bottom)]",
        "border-t border-white/[0.08]",
        "bg-[#0e0e13]/95 backdrop-blur-2xl shadow-2xl shadow-black",
      )}
      aria-label="Mobile Navigation"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1.5 min-h-[56px]">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[44px] flex-1 flex-col items-center justify-center rounded-lg py-1.5 transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-signal",
                active ? "text-white" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {/* Active state: a hairline, not a pill. */}
              {active && (
                <motion.span
                  layoutId="mobileNavActivePill"
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="absolute inset-x-3 top-0 h-px bg-signal"
                />
              )}

              <span className="relative z-10 flex flex-col items-center gap-1">
                <Icon
                  className={cn(
                    "size-4.5 transition-colors duration-150",
                    active ? "text-signal" : "text-ink-3",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-[0.62rem] font-semibold tracking-wide transition-colors",
                    active ? "font-semibold text-ink-1" : "text-ink-3",
                  )}
                >
                  {item.label}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
