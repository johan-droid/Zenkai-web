"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  Home,
  Tv,
  BookOpen,
  CalendarDays,
  Library,
  History,
  Search,
  Settings,
  Menu,
} from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { SearchCommand } from "@/components/search/search-command";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", href: "/", icon: Home },
  { id: "anime", label: "Anime", href: "/anime", icon: Tv },
  { id: "manga", label: "Manga", href: "/manga", icon: BookOpen },
  { id: "schedule", label: "Schedule", href: "/schedule", icon: CalendarDays },
  { id: "library", label: "Library", href: "/library", icon: Library },
  { id: "history", label: "History", href: "/history", icon: History },
];

export function HyprlandDock() {
  const pathname = usePathname();
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const activeTab = NAV_ITEMS.find((tab) => isActivePath(pathname, tab.href)) ?? NAV_ITEMS[0]!;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-black/85 backdrop-blur-2xl transition-all duration-300">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-6">
          <Brand />
        </div>

        {/* Center: Smooth Gliding Navigation Links */}
        <nav
          onMouseLeave={() => setHoveredTab(null)}
          className="relative hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 shadow-inner md:flex"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab.id === item.id;
            const isHovered = hoveredTab === item.id;

            return (
              <Link
                key={item.id}
                href={item.href}
                onMouseEnter={() => setHoveredTab(item.id)}
                className={cn(
                  "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold tracking-wide transition-colors duration-200",
                  isActive ? "text-white" : "text-zinc-400 hover:text-white",
                )}
              >
                {/* Active Sliding Pill with Motion spring physics */}
                {isActive && (
                  <motion.div
                    layoutId="hyprland-active-pill"
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 32,
                    }}
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-[#c8102e] via-[#e52545] to-[#c8102e] shadow-[0_0_20px_rgba(200,16,46,0.45)] ring-1 ring-white/30"
                  />
                )}

                {/* Hover Pill Effect */}
                {isHovered && !isActive && (
                  <motion.div
                    layoutId="hyprland-hover-pill"
                    transition={{
                      type: "spring",
                      stiffness: 450,
                      damping: 35,
                    }}
                    className="absolute inset-0 rounded-full bg-white/10"
                  />
                )}

                <span className="relative z-10 flex items-center gap-2">
                  <Icon className={cn("size-4 transition-transform duration-200 group-hover:scale-110", isActive ? "text-white" : "text-zinc-400")} />
                  <span>{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Right: Search, Settings & Mobile Menu */}
        <div className="flex items-center gap-2.5">
          <SearchCommand>
            <Button
              variant="ghost"
              size="sm"
              className="glass hidden h-9 w-48 justify-start gap-2.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-zinc-400 transition-all duration-200 hover:border-[#c8102e]/50 hover:text-white sm:flex sm:w-56"
            >
              <Search className="size-3.5 text-rose-400" />
              <span>Search anime, manga…</span>
              <kbd className="ml-auto rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[0.65rem] font-mono font-medium text-zinc-400">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search"
              className="glass rounded-full border border-white/10 sm:hidden"
              asChild
            >
              <Link href="/search">
                <Search className="size-4 text-rose-400" />
              </Link>
            </Button>
          </SearchCommand>

          <Button
            variant="ghost"
            size="icon"
            asChild
            className="glass size-9 rounded-full border border-white/10 text-zinc-400 transition-colors hover:text-white"
          >
            <Link href="/settings" aria-label="Settings">
              <Settings className="size-4 transition-transform duration-300 hover:rotate-45" />
            </Link>
          </Button>

          <MobileHyprlandMenu pathname={pathname} activeId={activeTab.id} />
        </div>
      </div>
    </header>
  );
}

function MobileHyprlandMenu({ pathname, activeId }: { pathname: string; activeId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="glass rounded-full border border-white/10 md:hidden">
          <Menu className="size-4 text-zinc-300" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="glass-strong w-72 border-glass-border bg-[#0e0e14]/95 backdrop-blur-2xl">
        <SheetTitle className="px-1">
          <Brand />
        </SheetTitle>
        <div className="mt-6 flex flex-col gap-2">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Navigation
          </p>
          <div className="flex flex-col gap-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeId === item.id;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-all",
                    isActive
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 border-t border-white/10 pt-4">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <Settings className="size-4" />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
