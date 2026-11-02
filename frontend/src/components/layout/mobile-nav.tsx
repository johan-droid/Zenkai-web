"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Tv, BookOpen, CalendarDays } from "lucide-react";

import { isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

const MOBILE_NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Anime", href: "/anime", icon: Tv },
  { label: "Manga", href: "/manga", icon: BookOpen },
  { label: "Schedule", href: "/schedule", icon: CalendarDays },
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
        "border-t border-white/[0.04]",
        "bg-[#0e0e12]/95 backdrop-blur-xl",
      )}
      aria-label="Mobile Navigation"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1 py-0.5">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors duration-150 outline-none",
                active ? "text-white" : "text-zinc-400 hover:text-zinc-300",
              )}
            >
              {/* Active pill – thinner */}
              {active && (
                <span className="absolute inset-x inset-y-0 rounded-xl bg-white/5 ring-1 ring-white/5"/>
              )}

              <span className="relative z-10 flex flex-col items-center gap-0.5">
                <Icon
                  className={cn(
                    "size-3.5 transition-transform duration-150",
                    active ? "text-[#c8102a] scale-105" : "text-zinc-400",
                  )}
                  aria-hidden
                />
                <span className="text-[0.56rem] font-semibold tracking-wide">
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
