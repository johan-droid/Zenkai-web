"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bookmark,
  Download,
  History,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { usePWA } from "@/components/providers/pwa-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { SearchCommand } from "@/components/search/search-command";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { navSections, isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const { isInstallable, isStandalone, installPWA } = usePWA();
  const { user, isAuthenticated, logout, syncNow } = useAuth();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-white/[0.08] bg-[#101014]/85 backdrop-blur-xl transition-all",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Brand />

        {/* Desktop Nav Links */}
        <nav
          className="hidden items-center gap-1 lg:flex ml-2 w-full max-w-[calc(100%-4rem)]"
          aria-label="Primary Navigation"
        >
          {navSections[0]!.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-xl px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200",
                  active
                    ? "text-white bg-white/[0.08] shadow-sm ring-1 ring-white/10"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.05]",
                )}
              >
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Install PWA Button */}
          {isInstallable && !isStandalone ? (
            <Button
              variant="outline"
              size="sm"
              onClick={installPWA}
              aria-label="Install Zenkai App"
              className="hidden items-center gap-2 rounded-xl border-[#C51F3A]/40 bg-[#C51F3A]/10 px-3 text-xs font-semibold text-white hover:bg-[#C51F3A]/20 hover:border-[#C51F3A]/70 md:flex transition-all duration-200"
            >
              <Download className="size-3.5 text-[#ff4a68]" />
              <span>Install App</span>
            </Button>
          ) : null}

          {/* Desktop Search Palette */}
          <SearchCommand>
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-9 w-48 sm:flex lg:w-60 justify-start gap-2.5 rounded-xl border border-white/[0.08] bg-[#16161c]/80 px-3 text-xs text-zinc-400 hover:border-white/20 hover:bg-[#1e1e26] hover:text-white transition-all backdrop-blur-md"
            >
              <Search className="size-3.5 text-zinc-400" />
              <span>Search</span>
            </Button>
          </SearchCommand>

          {/* Mobile search trigger */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            className="sm:hidden rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08]"
          >
            <Search className="size-4.5" />
          </Button>

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
          className="lg:hidden rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08]"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <div className="flex flex-col h-full">
          <SheetTitle className="px-5 pt-5 pb-4 border-b border-white/10">
            <Brand />
          </SheetTitle>
          <nav
            className="flex-1 flex flex-col gap-5 overflow-y-auto px-4 py-5"
            aria-label="Mobile Navigation"
          >
            {isInstallable && !isStandalone ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  installPWA();
                }}
                className="flex w-full items-center justify-start gap-3 rounded-xl border-[#C51F3A]/40 bg-[#C51F3A]/10 px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#C51F3A]/20"
              >
                <Download className="size-4 text-[#ff4a68]" />
                <span>Install Zenkai App</span>
              </Button>
            ) : null}

            {navSections.map((section, index) => (
              <div
                key={section.title ?? index}
                className="flex flex-col gap-0.5"
              >
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
                      className={cn(
                        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        active
                          ? "text-white bg-[#C51F3A]/20 border border-[#C51F3A]/30"
                          : "text-zinc-400 hover:text-white hover:bg-white/[0.06]",
                      )}
                    >
                      <Icon className="size-4" />
                      <span>{item.label}</span>
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
