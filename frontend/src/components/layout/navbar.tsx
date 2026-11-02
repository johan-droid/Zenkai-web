"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, Menu, Search } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { usePWA } from "@/components/providers/pwa-provider";
import { SearchCommand } from "@/components/search/search-command";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { primaryNav, navSections, isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const { isInstallable, isStandalone, installPWA } = usePWA();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-white/[0.07] bg-surface-0/90 pt-[env(safe-area-inset-top)] backdrop-blur-md transition-all",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Brand className="shrink-0" />

        {/* Desktop nav: every destination, not just the first section. */}
        <nav
          className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 xl:flex"
          aria-label="Primary Navigation"
        >
          {primaryNav.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative px-3 py-2 text-xs font-semibold tracking-wide transition-colors duration-150",
                  "after:absolute after:inset-x-3 after:-bottom-0.5 after:h-px after:bg-signal after:transition-opacity",
                  active
                    ? "text-ink-1 after:opacity-100"
                    : "text-ink-3 after:opacity-0 hover:text-ink-1",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Install PWA Button */}
          {isInstallable && !isStandalone ? (
            <Button
              variant="outline"
              size="sm"
              onClick={installPWA}
              aria-label="Install Zenkai App"
              className="hidden items-center gap-2 rounded-xl border-[#C51F3A]/40 bg-[#C51F3A]/10 px-3 text-xs font-semibold text-white transition-all duration-200 hover:border-[#C51F3A]/70 hover:bg-[#C51F3A]/20 md:flex"
            >
              <Download className="size-3.5 text-[#ff4a68]" />
              <span className="hidden lg:inline">Install App</span>
            </Button>
          ) : null}

          {/* Desktop Search Palette */}
          <SearchCommand>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Search anime and manga"
              className="hidden h-10 w-48 items-center justify-start gap-2.5 rounded-xl border border-white/[0.08] bg-[#16161c]/80 px-3 text-xs text-zinc-400 backdrop-blur-md transition-all hover:border-white/20 hover:bg-[#1e1e26] hover:text-white sm:flex xl:w-56"
            >
              <Search className="size-3.5 text-zinc-400" />
              <span>Search</span>
            </Button>
          </SearchCommand>

          {/* Mobile search trigger */}
          <SearchCommand>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search anime and manga"
              className="flex size-11 items-center justify-center rounded-xl text-zinc-300 hover:bg-white/[0.08] hover:text-white active:scale-95 sm:hidden"
            >
              <Search className="size-4" />
            </Button>
          </SearchCommand>

          <MobileMenu pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

/**
 * The drawer is the navigation surface below `xl`, where the full desktop link
 * row does not fit. It replaces the old `lg`-only cutoff, which left `/history`
 * and `/settings` unreachable on laptop-width screens.
 */
function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const { isInstallable, isStandalone, installPWA } = usePWA();

  useEffect(() => {
    // Close the drawer whenever navigation lands on a new route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="flex size-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.08] hover:text-white xl:hidden"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="border-l border-white/10 bg-[#0e0e13]/98 backdrop-blur-2xl">
        <SheetTitle className="flex items-center border-b border-white/10 px-4 pt-5 pr-14 pb-4">
          <Brand />
        </SheetTitle>
        <SheetDescription className="sr-only">
          Primary site navigation
        </SheetDescription>
        <nav
          className="flex flex-1 flex-col gap-5 px-3 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          aria-label="Site Navigation"
        >
          {isInstallable && !isStandalone ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                installPWA();
              }}
              className="flex min-h-11 w-full items-center justify-start gap-3 rounded-xl border-[#C51F3A]/40 bg-[#C51F3A]/10 px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#C51F3A]/20"
            >
              <Download className="size-4 text-[#ff4a68]" />
              <span>Install Zenkai App</span>
            </Button>
          ) : null}

          {navSections.map((section, index) => (
            <div key={section.title ?? index} className="flex flex-col gap-0.5">
              {section.title ? (
                <p className="px-3 pb-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-zinc-500">
                  {section.title}
                </p>
              ) : null}
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors duration-200",
                      active
                        ? "border border-[#C51F3A]/30 bg-[#C51F3A]/20 text-white"
                        : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
