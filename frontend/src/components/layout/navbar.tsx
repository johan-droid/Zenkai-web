"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

import { Brand } from "@/components/layout/brand";
import { usePWA } from "@/components/providers/pwa-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { SearchCommand } from "@/components/search/search-command";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { navSections, isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  Download,
  History,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  User,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const { isInstallable, isStandalone, installPWA } = usePWA();
  const { user, isAuthenticated, isSyncing, syncNow, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 12);
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? Math.min(y / docHeight, 1) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-500",
        scrolled
          ? "glass-strong border-b border-white/[0.06] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_32px_-8px_rgba(0,0,0,0.8)]"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Brand />

        {/* Desktop Nav Links */}
        <nav className="ml-5 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {navSections[0]!.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="navbar-active-pill"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="absolute inset-0 rounded-xl bg-white/[0.08] ring-1 ring-white/[0.08]"
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Install PWA */}
          {isInstallable && !isStandalone ? (
            <Button
              variant="outline"
              size="sm"
              onClick={installPWA}
              aria-label="Install Zenkai App"
              className="hidden items-center gap-2 rounded-xl border-[#b8102a]/35 bg-[#b8102a]/08 px-3 text-rose-300/90 hover:bg-[#b8102a]/18 hover:text-white hover:border-[#b8102a]/60 md:flex transition-all duration-200"
            >
              <Download className="size-3.5" />
              <span>Install App</span>
            </Button>
          ) : null}

          {/* Mobile search icon — goes directly to /search */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            className="sm:hidden rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
            asChild
          >
            <Link href="/search">
              <Search className="size-4" />
            </Link>
          </Button>

          {/* Desktop Search Palette */}
          <SearchCommand>
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-9 w-52 justify-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 text-muted-foreground hover:text-foreground hover:bg-white/[0.07] hover:border-white/[0.12] sm:flex lg:w-60 transition-all duration-200"
            >
              <Search className="size-3.5" />
              <span className="text-sm">Search…</span>
              <kbd className="ml-auto rounded-md border border-white/[0.08] bg-black/30 px-1.5 py-0.5 text-[0.62rem] font-medium text-muted-foreground/70">
                ⌘K
              </kbd>
            </Button>
          </SearchCommand>

          {/* History */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="History"
            title="History"
            className="hidden lg:flex rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors duration-200"
            asChild
          >
            <Link href="/history">
              <History className="size-4" />
            </Link>
          </Button>

          {/* Settings */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            title="Settings"
            className="hidden lg:flex rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors duration-200"
            asChild
          >
            <Link href="/settings">
              <Settings className="size-4" />
            </Link>
          </Button>

          {/* User Account */}
          {isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="User Account Menu"
                  className="flex size-9 items-center justify-center rounded-xl border border-[#b8102a]/30 bg-[#b8102a]/12 text-rose-300 transition-all duration-200 hover:bg-[#b8102a]/22 hover:ring-2 hover:ring-[#b8102a]/35 hover:border-[#b8102a]/50"
                >
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {user.username.slice(0, 2)}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="glass-strong min-w-56 border-white/[0.07] p-1.5 rounded-2xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.9)]"
              >
                <div className="flex flex-col px-2.5 py-2">
                  <span className="text-sm font-semibold text-foreground">
                    {user.displayName || user.username}
                  </span>
                  <span className="text-xs text-muted-foreground">@{user.username}</span>
                </div>
                <DropdownMenuSeparator className="bg-white/[0.06]" />
                <DropdownMenuItem asChild>
                  <Link href={`/user/${user.username}`} className="flex cursor-pointer items-center gap-2.5 rounded-xl">
                    <User className="size-4 text-muted-foreground" />
                    <span>Public Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/library" className="flex cursor-pointer items-center gap-2.5 rounded-xl">
                    <Bookmark className="size-4 text-muted-foreground" />
                    <span>My Library</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void syncNow()}
                  disabled={isSyncing}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl"
                >
                  <RefreshCw className={cn("size-4 text-muted-foreground", isSyncing && "animate-spin text-rose-400")} />
                  <span>{isSyncing ? "Syncing…" : "Sync Cloud Now"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex cursor-pointer items-center gap-2.5 rounded-xl">
                    <Settings className="size-4 text-muted-foreground" />
                    <span>Preferences</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/[0.06]" />
                <DropdownMenuItem
                  onClick={() => void logout()}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl text-rose-400 focus:bg-rose-500/10 focus:text-rose-300"
                >
                  <LogOut className="size-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="hidden items-center gap-2 rounded-xl border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-muted-foreground hover:bg-white/[0.09] hover:text-foreground hover:border-white/[0.14] lg:flex transition-all duration-200"
            >
              <Link href="/settings">
                <User className="size-3.5" />
                <span>Sign In</span>
              </Link>
            </Button>
          )}

          <MobileMenu pathname={pathname} />
        </div>
      </div>

      {/* Scroll progress micro-line */}
      <AnimatePresence>
        {scrolled && scrollProgress > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-0 left-0 h-[1.5px] bg-gradient-to-r from-[#b8102a]/80 via-[#e84060]/90 to-[#b8102a]/40"
            style={{ width: `${scrollProgress * 100}%` }}
          />
        )}
      </AnimatePresence>
    </header>
  );
}

function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const { isInstallable, isStandalone, installPWA } = usePWA();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="lg:hidden rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="glass-strong w-72 border-white/[0.07] p-0">
        <div className="flex flex-col h-full">
          <SheetTitle className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
            <Brand />
          </SheetTitle>
          <nav className="flex-1 flex flex-col gap-5 overflow-y-auto px-4 py-5" aria-label="Mobile">
            {isInstallable && !isStandalone ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setOpen(false); installPWA(); }}
                className="flex w-full items-center justify-start gap-3 rounded-xl border-[#b8102a]/35 bg-[#b8102a]/08 px-3 py-2.5 text-sm font-medium text-rose-300/90 hover:bg-[#b8102a]/18 hover:text-white"
              >
                <Download className="size-4" />
                <span>Install Zenkai App</span>
              </Button>
            ) : null}

            {navSections.map((section, index) => (
              <div key={section.title ?? index} className="flex flex-col gap-0.5">
                {section.title ? (
                  <p className="px-3 pb-1.5 text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground/70 uppercase">
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
                      className={cn(
                        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="mobile-menu-pill"
                          className="absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-white/[0.07]"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <Icon className="relative z-10 size-4" />
                      <span className="relative z-10">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
