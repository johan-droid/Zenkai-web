"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Menu } from "lucide-react";

import { AccountMenu } from "@/components/layout/account-menu";
import { Brand } from "@/components/layout/brand";
import { HeaderSearch } from "@/components/layout/header-search";
import { usePWA } from "@/components/providers/pwa-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  immersiveParentPath,
  isActivePath,
  isImmersivePath,
  navSections,
  primaryNav,
} from "@/config/nav";
import { cn } from "@/lib/utils";

/**
 * The global header. One sticky surface carrying brand, discovery navigation,
 * search and the account menu — plus a compact variant on playback and
 * reading routes, which otherwise have no way back to the title page.
 *
 * The scrolled state is a single boolean driven by one throttled, passive
 * listener. React bails out of the re-render while it stays unchanged, so
 * scrolling the page costs nothing beyond a `scrollY` read per frame.
 */
export function Navbar() {
  const pathname = usePathname();
  const scrolled = useScrolled(8);
  const immersive = isImmersivePath(pathname);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b pt-[env(safe-area-inset-top)]",
        "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
        scrolled
          ? "border-line bg-surface-0/95 shadow-[0_1px_18px_-8px_rgba(0,0,0,0.9)] backdrop-blur-xl"
          : "border-white/[0.07] bg-surface-0/85 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-2 px-3 sm:gap-4 sm:px-6">
        {immersive ? (
          <ImmersiveBar pathname={pathname} />
        ) : (
          <>
            <Brand className="shrink-0" />

            {/* Desktop nav: every discovery destination, not just the first section. */}
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
              <InstallButton className="hidden md:flex" />
              <HeaderSearch />
              <AccountMenu />
              <NavDrawer pathname={pathname} />
            </div>
          </>
        )}
      </div>
    </header>
  );
}

/**
 * Compact header for `/watch`, `/read` and `/read-novel`: back to the title,
 * the brand, search and account. No discovery row, no install prompt — nothing
 * that competes with the media or stacks controls over the player.
 */
function ImmersiveBar({ pathname }: { pathname: string }) {
  const backHref = immersiveParentPath(pathname);

  return (
    <>
      <Link
        href={backHref}
        aria-label="Back to title"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-white/[0.08] hover:text-ink-1"
      >
        <ArrowLeft className="size-4.5" aria-hidden />
      </Link>

      <Brand size="sm" className="min-w-0 shrink" />

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <HeaderSearch />
        <AccountMenu />
        <NavDrawer pathname={pathname} />
      </div>
    </>
  );
}

function InstallButton({ className }: { className?: string }) {
  const { isInstallable, isStandalone, installPWA } = usePWA();
  if (!isInstallable || isStandalone) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={installPWA}
      aria-label="Install Zenkai App"
      className={cn(
        "h-10 gap-2 rounded-xl border-signal/40 bg-signal/10 px-3 text-xs font-semibold text-ink-1 transition-colors hover:border-signal/70 hover:bg-signal/20",
        className,
      )}
    >
      <Download className="size-3.5 text-signal-soft" aria-hidden />
      <span className="hidden lg:inline">Install App</span>
    </Button>
  );
}

/**
 * The drawer is the navigation surface below `xl`, where the full desktop link
 * row does not fit. Radix Dialog supplies Escape, focus trap, focus restore
 * and scroll lock; the trigger stays available at every width below `xl` so
 * `/history` and `/settings` are never unreachable.
 */
function NavDrawer({ pathname }: { pathname: string }) {
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
          aria-label="Open navigation menu"
          className="flex size-11 items-center justify-center rounded-xl text-ink-2 hover:bg-white/[0.08] hover:text-ink-1 xl:hidden"
        >
          <Menu className="size-4" aria-hidden />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="border-l border-line bg-surface-1/98 backdrop-blur-2xl"
      >
        <SheetTitle className="flex items-center border-b border-line px-4 pt-5 pr-14 pb-4">
          <Brand />
        </SheetTitle>
        <SheetDescription className="sr-only">
          Primary site navigation
        </SheetDescription>

        <nav
          className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-3 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
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
              className="flex min-h-11 w-full items-center justify-start gap-3 rounded-xl border-signal/40 bg-signal/10 px-3 py-2.5 text-sm font-semibold text-ink-1 hover:bg-signal/20"
            >
              <Download className="size-4 text-signal-soft" aria-hidden />
              <span>Install Zenkai App</span>
            </Button>
          ) : null}

          {navSections.map((section, index) => (
            <div key={section.title ?? index} className="flex flex-col gap-0.5">
              {section.title ? (
                <p className="px-3 pb-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-3">
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
                        ? "border border-signal/30 bg-signal/15 text-ink-1"
                        : "text-ink-2 hover:bg-white/[0.06] hover:text-ink-1",
                    )}
                  >
                    <Icon
                      className={cn("size-4 shrink-0", active && "text-signal-soft")}
                      aria-hidden
                    />
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

/**
 * One passive, rAF-throttled scroll listener for the whole header. It reads
 * `scrollY` once per frame and only produces a new value when the boolean
 * actually flips, so continuous scrolling triggers no re-render churn.
 */
function useScrolled(offset: number): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > offset);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [offset]);

  return scrolled;
}
