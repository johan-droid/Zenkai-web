"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
import { Bookmark, Download, History, LogOut, Menu, RefreshCw, Search, Settings, User } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const { isInstallable, isStandalone, installPWA } = usePWA();
  const { user, isAuthenticated, isSyncing, syncNow, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-colors duration-300",
        scrolled ? "glass-strong border-b border-glass-border" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Brand />

        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Primary">
          {navSections[0]!.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActivePath(pathname, item.href)
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isInstallable && !isStandalone ? (
            <Button
              variant="outline"
              size="sm"
              onClick={installPWA}
              aria-label="Install Zenkai App"
              className="hidden items-center gap-2 rounded-xl border-[#c8102e]/40 text-rose-300 hover:bg-[#c8102e]/20 hover:text-white md:flex"
            >
              <Download className="size-4" />
              <span>Install App</span>
            </Button>
          ) : null}

          {/* Mobile search button navigates directly without opening modal */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            className="sm:hidden"
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
              className="hidden h-9 w-52 justify-start gap-2 rounded-xl px-3 text-muted-foreground hover:text-foreground sm:flex lg:w-60"
            >
              <Search className="size-4" />
              <span className="text-sm">Search…</span>
              <kbd className="ml-auto rounded-md border border-glass-border bg-black/20 px-1.5 py-0.5 text-[0.65rem] font-medium">
                ⌘K
              </kbd>
            </Button>
          </SearchCommand>

          <Button
            variant="ghost"
            size="icon"
            aria-label="History"
            title="History"
            className="hidden lg:flex"
            asChild
          >
            <Link href="/history">
              <History className="size-4 text-muted-foreground hover:text-foreground" />
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            title="Settings"
            className="hidden lg:flex"
            asChild
          >
            <Link href="/settings">
              <Settings className="size-4 text-muted-foreground hover:text-foreground" />
            </Link>
          </Button>

          {/* User Account / Sign In Pill */}
          {isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="User Account Menu"
                  className="flex size-9 items-center justify-center rounded-xl border border-glass-border bg-[#c8102e]/20 text-[#ff4d6a] transition-all hover:bg-[#c8102e]/30 hover:ring-2 hover:ring-[#c8102e]/40"
                >
                  <span className="text-xs font-bold uppercase">
                    {user.username.slice(0, 2)}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-strong min-w-52 border-glass-border p-1.5">
                <div className="flex flex-col px-2 py-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {user.displayName || user.username}
                  </span>
                  <span className="text-xs text-muted-foreground">@{user.username}</span>
                </div>
                <DropdownMenuSeparator className="bg-glass-border" />
                <DropdownMenuItem asChild>
                  <Link href={`/user/${user.username}`} className="flex cursor-pointer items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <span>Public Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/library" className="flex cursor-pointer items-center gap-2">
                    <Bookmark className="size-4 text-muted-foreground" />
                    <span>My Library</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void syncNow()}
                  disabled={isSyncing}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <RefreshCw className={cn("size-4 text-muted-foreground", isSyncing && "animate-spin text-[#ff4d6a]")} />
                  <span>{isSyncing ? "Syncing…" : "Sync Cloud Now"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex cursor-pointer items-center gap-2">
                    <Settings className="size-4 text-muted-foreground" />
                    <span>Preferences</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-glass-border" />
                <DropdownMenuItem
                  onClick={() => void logout()}
                  className="flex cursor-pointer items-center gap-2 text-rose-400 focus:bg-rose-500/10 focus:text-rose-300"
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
              className="glass hidden items-center gap-2 rounded-xl border-glass-border px-3 text-xs font-medium hover:bg-white/10 lg:flex"
            >
              <Link href="/settings">
                <User className="size-3.5 text-muted-foreground" />
                <span>Sign In</span>
              </Link>
            </Button>
          )}

          <MobileMenu pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const { isInstallable, isStandalone, installPWA } = usePWA();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="lg:hidden">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="glass-strong w-72 border-glass-border">
        <SheetTitle className="px-1">
          <Brand />
        </SheetTitle>
        <nav className="mt-4 flex flex-col gap-6 px-1" aria-label="Mobile">
          {isInstallable && !isStandalone ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                installPWA();
              }}
              className="flex w-full items-center justify-start gap-3 rounded-xl border-[#c8102e]/40 px-3 py-2.5 text-sm font-medium text-rose-300 hover:bg-[#c8102e]/20 hover:text-white"
            >
              <Download className="size-4" />
              <span>Install Zenkai App</span>
            </Button>
          ) : null}
          {navSections.map((section, index) => (
            <div key={section.title ?? index} className="flex flex-col gap-1">
              {section.title ? (
                <p className="px-3 pb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
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
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {item.label}
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
