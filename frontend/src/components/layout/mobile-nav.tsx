"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath, mobileNav } from "@/config/nav";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-2">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.68rem] font-bold tracking-wide transition-colors",
                active ? "text-white" : "text-zinc-400 hover:text-white",
              )}
            >
              {active && (
                <motion.div
                  layoutId="mobile-nav-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className="absolute inset-x-3 top-1 bottom-1 rounded-xl bg-gradient-to-r from-[#c8102e] to-[#e52545] shadow-[0_0_12px_rgba(200,16,46,0.5)] ring-1 ring-white/20"
                />
              )}
              <span className="relative z-10 flex flex-col items-center gap-1">
                <Icon className={cn("size-5 transition-transform", active ? "text-white" : "text-zinc-400")} />
                <span>{item.label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
