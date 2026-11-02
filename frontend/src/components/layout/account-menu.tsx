"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { personalNav } from "@/config/nav";

/**
 * The account surface. Reads the session from `AuthProvider` and renders
 * nothing but navigation — no tokens, no email, no role flags. Authorization
 * stays on the backend; this menu only ever links to routes that exist.
 *
 * Guests get the same personal destinations plus a real sign-in entry, which
 * points at `/settings` because that is where the sign-in form actually lives
 * (there is no `/login` route).
 */
export function AccountMenu() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  // Hold the button's footprint while the session resolves so the header
  // never shifts under the user's thumb.
  if (isLoading) {
    return (
      <span
        aria-hidden
        className="block size-11 shrink-0 rounded-xl bg-surface-1 ring-1 ring-line"
      />
    );
  }

  const name = user ? user.displayName || user.username : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isAuthenticated && name ? `Account menu for ${name}` : "Account menu"}
          className="size-11 shrink-0 rounded-xl text-ink-2 hover:bg-white/[0.08] hover:text-ink-1 aria-expanded:bg-white/[0.08] aria-expanded:text-ink-1"
        >
          <Avatar className="size-8 ring-1 ring-line">
            {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback
              className={
                isAuthenticated
                  ? "bg-signal/20 text-[0.7rem] font-bold text-signal-soft"
                  : "bg-surface-2 text-ink-2"
              }
            >
              {isAuthenticated && name ? (
                initials(name)
              ) : (
                <UserRound className="size-4" aria-hidden />
              )}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-56 p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs">
          {isAuthenticated && user ? (
            <span className="block truncate text-ink-1">@{user.username}</span>
          ) : (
            <span className="block text-ink-3">Not signed in</span>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {isAuthenticated && user ? (
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/user/${encodeURIComponent(user.username)}`}>
              <UserRound className="size-4" aria-hidden />
              <span>Profile</span>
            </Link>
          </DropdownMenuItem>
        ) : null}

        {personalNav.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.href} asChild className="cursor-pointer">
              <Link href={item.href}>
                <Icon className="size-4" aria-hidden />
                <span>{item.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        {isAuthenticated ? (
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer"
            onSelect={() => void logout()}
          >
            <LogOut className="size-4" aria-hidden />
            <span>Sign out</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild className="cursor-pointer bg-signal/12 text-ink-1 focus:bg-signal/25">
            <Link href="/settings">
              <span>Sign in or create account</span>
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const mark = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return mark.toUpperCase() || "?";
}
