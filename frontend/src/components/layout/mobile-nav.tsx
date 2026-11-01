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
        "bg-[#101014]/90 backdrop-blur-xl shadow-2xl",
      )}
      aria-label="Mobile Navigation"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 py-1.5 transition-colors duration-200 outline-none",
                active ? "text-white" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {/* Active pill background */}
              {active && (
                <span className="absolute inset-x-1.5 inset-y-0.5 rounded-xl bg-white/[0.08] ring-1 ring-white/10" />
              )}

              <span className="relative z-10 flex flex-col items-center gap-1">
                <Icon
                  className={cn(
                    "size-4.5 transition-transform duration-200",
                    active ? "text-[#ff4a68] scale-110" : "text-zinc-400",
                  )}
                  aria-hidden
                />
                <span className="text-[0.62rem] font-semibold tracking-wide">
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
