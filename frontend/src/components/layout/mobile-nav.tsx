"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Tv, BookOpen, CalendarDays, Library } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
        "border-t border-white/[0.06]",
        "bg-[#06060a]/90 backdrop-blur-2xl",
        "shadow-[0_-8px_40px_rgba(0,0,0,0.8),0_-1px_0_0_rgba(255,255,255,0.05)_inset]",
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
                "text-[0.65rem] font-semibold tracking-wide transition-colors duration-200",
                active ? "text-white" : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              {/* Active background pill */}
              <AnimatePresence>
                {active && (
                  <motion.span
                    layoutId="mobile-nav-pill"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 380, damping: 26 }}
                    className="absolute inset-x-2 top-1.5 bottom-1.5 rounded-xl bg-[#b8102a]/18 ring-1 ring-[#b8102a]/30"
                  />
                )}
              </AnimatePresence>

              <span className="relative z-10 flex flex-col items-center gap-1">
                <motion.span
                  animate={active ? { scale: 1.1 } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <Icon
                    className={cn(
                      "size-5 transition-colors duration-200",
                      active ? "text-[#e84060]" : "text-zinc-500",
                    )}
                  />
                </motion.span>
                <span>{item.label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
