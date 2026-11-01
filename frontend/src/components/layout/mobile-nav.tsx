"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Tv, BookOpen, CalendarDays, Library } from "lucide-react";

import { isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

const MOBILE_NAV_ITEMS = [
  { label: "Home",     href: "/",         icon: Home         },
  { label: "Anime",    href: "/anime",    icon: Tv           },
  { label: "Manga",    href: "/manga",    icon: BookOpen     },
  { label: "Schedule", href: "/schedule", icon: CalendarDays },
  { label: "Library",  href: "/library",  icon: Library      },
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
      className={[
        "fixed inset-x-0 bottom-0 z-50 md:hidden",
        "pb-[env(safe-area-inset-bottom)]",
        "border-t border-surface-2/90",
        "bg-surface-1",
      ].join(" ")}
      aria-label="Mobile"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5",
                "text-[0.65rem] font-semibold tracking-wide",
                active ? "text-signal" : "text-ink-3/60 hover:text-signal",
              )}
            >
              {/* Active background pill */}
              <span
                className={cn(
                  "absolute inset-x-2 top-1.5 bottom-1.5 rounded-xl bg-surface-1/18 ring-1 ring-signal/30",
                )}
              />

              <span className="relative z-10 flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "size-5 transition-colors duration-200",
                    active ? "text-signal" : "text-ink-3/60",
                  )}
                >
                  <Icon
                    className="size-5 transition-colors duration-200"
                    aria-hidden
                  />
                </span>
                <span>{item.label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}