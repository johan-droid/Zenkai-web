"use client";

import { Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Brand } from "@/components/layout/brand";
import { SearchCommand } from "@/components/search/search-command";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { navSections, isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

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

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {navSections[0]!.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "glass-hover rounded-lg px-3 py-2 text-sm font-medium",
                isActivePath(pathname, item.href)
                  ? "glass text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <SearchCommand>
            <Button
              variant="ghost"
              size="sm"
              className="glass hidden h-9 w-56 justify-start gap-2 rounded-xl px-3 text-muted-foreground hover:text-foreground sm:flex"
            >
              <Search className="size-4" />
              <span className="text-sm">Search…</span>
              <kbd className="ml-auto rounded-md border border-glass-border bg-black/20 px-1.5 py-0.5 text-[0.65rem] font-medium">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search"
              className="glass sm:hidden"
              asChild
            >
              <Link href="/search">
                <Search className="size-4" />
              </Link>
            </Button>
          </SearchCommand>

          <MobileMenu pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="glass lg:hidden">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="glass-strong w-72 border-glass-border">
        <SheetTitle className="px-1">
          <Brand />
        </SheetTitle>
        <nav className="mt-4 flex flex-col gap-6 px-1">
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
                      active ? "glass text-foreground" : "text-muted-foreground hover:text-foreground",
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
