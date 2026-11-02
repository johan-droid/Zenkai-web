"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { bottomNav, isActivePath, isImmersivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

/**
 * Fixed bottom bar — the primary navigation surface on phones. It carries only
 * the highest-value destinations (`bottomNav`), never a copy of the desktop
 * row, and gets out of the way entirely on playback and reading routes.
 */
export function MobileNav() {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();

  const isImmersiveMedia = isImmersivePath(pathname);

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
        {bottomNav.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[44px] flex-1 flex-col items-center justify-center rounded-lg py-1.5 transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-signal",
                active ? "text-white" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {/* Active state: a hairline, not a pill. Animated only when the
                  user has not asked for reduced motion. */}
              {active ? (
                shouldReduceMotion ? (
                  <span aria-hidden className="absolute inset-x-3 top-0 h-px bg-signal" />
                ) : (
                  <motion.span
                    layoutId="mobileNavActivePill"
                    transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    className="absolute inset-x-3 top-0 h-px bg-signal"
                  />
                )
              ) : null}

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
                    "text-[0.68rem] font-semibold tracking-wide transition-colors",
                    active ? "text-ink-1" : "text-ink-3",
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
