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
import { navSections, isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const { isInstallable, isStandalone, installPWA } = usePWA();
  const { user, isAuthenticated } = useAuth();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full bg-surface-1 border-b border-surface-2/90 shadow-[0_1px_0_0_rgba(0,0,0,0.04)_inset]",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Brand />

        {/* Desktop Nav Links */}
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {navSections[0]!.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-xl px-3.5 py-2 text-sm font-medium",
                  active ? "text-foreground hover:text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                )}
              >
                {active && (
                  <span className="absolute inset-0 rounded-xl bg-signal/10 ring-1 ring-signal/10" />
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
              className="hidden items-center gap-2 rounded-xl border-signal/35 bg-signal/08 px-3 text-signal-ink/90 hover:bg-signal/18 hover:text-white hover:border-signal/60 md:flex transition-colors duration-200"
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
            className="sm:hidden rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
            asChild
          >
            <Link href="/search">
              <Search className="size-4" />
            </Link>
          </Button>

          {/* History */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="History"
            title="History"
            className="hidden lg:flex rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-2/60 transition-colors duration-200"
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
            className="hidden lg:flex rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-2/60 transition-colors duration-200"
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
                  className="flex size-9 items-center justify-center rounded-xl border-surface-2/90 bg-surface-1/12 text-signal/90 transition-colors duration-200 hover:bg-surface-1/22 hover:ring-2 hover:ring-signal/35 hover:border-signal/50"
                >
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {user.username.slice(0, 2)}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="glass-strong min-w-56 border-surface-2/70 p-1.5 rounded-2xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.9)]"
              >
                <div className="flex flex-col px-2.5 py-2">
                  <span className="text-sm font-semibold text-foreground">
                    {user.displayName || user.username}
                  </span>
                  <span className="text-xs text-muted-foreground">@{user.username}</span>
                </div>
                <DropdownMenuSeparator className="bg-surface-2/70" />
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
                  onClick={() => void void syncNow()}
                  disabled={false}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl"
                >
                  <RefreshCw className="size-4 text-muted-foreground" />
                  <span>Sync Cloud Now</span>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex cursor-pointer items-center gap-2.5 rounded-xl">
                    <Settings className="size-4 text-muted-foreground" />
                    <span>Preferences</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-surface-2/70" />
                <DropdownMenuItem
                  onClick={() => void logout()}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl text-signal-400 focus:bg-rose-500/10 focus:text-signal-300"
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
              className="hidden items-center gap-2 rounded-xl border-surface-2/80 bg-white/04 px-3 text-xs font-medium text-muted-foreground hover:bg-surface-2/09 hover:text-foreground hover:border-surface-2/14 lg:flex transition-colors duration-200"
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
          className="lg:hidden rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="glass-strong w-72 border-surface-2/70 p-0">
        <div className="flex flex-col h-full">
          <SheetTitle className="px-5 pt-5 pb-4 border-b border-surface-2/70">
            <Brand />
          </SheetTitle>
          <nav className="flex-1 flex flex-col gap-5 overflow-y-auto px-4 py-5" aria-label="Mobile">
            {isInstallable && !isStandalone ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setOpen(false); installPWA(); }}
                className="flex w-full items-center justify-start gap-3 rounded-xl border-signal/35 bg-signal/08 px-3 py-2.5 text-sm font-medium text-signal/90 hover:bg-signal/18 hover:text-white"
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
                        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                        active ? "text-foreground hover:text-foreground hover:bg-surface-2" : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                      )}
                    >
                      {active && (
                        <span className="absolute inset-0 rounded-xl bg-signal/10 ring-1 ring-signal/10" />
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