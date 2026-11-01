"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({
  className,
  href = "/",
  size = "md",
}: {
  className?: string;
  href?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: { container: "size-8 rounded-lg p-1",     text: "text-base", sub: "text-[0.46rem]" },
    md: { container: "size-9 rounded-xl p-1.5",   text: "text-lg",   sub: "text-[0.50rem]" },
    lg: { container: "size-12 rounded-2xl p-2",   text: "text-2xl",  sub: "text-[0.60rem]" },
  }[size];

  return (
    <Link
      href={href}
      className={cn("group flex items-center gap-2.5 outline-none select-none", className)}
      aria-label="Zenkai home"
    >
      {/* Logo mark */}
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden",
          "bg-surface-1",
          "border border-surface-2/80",
          "ring-1 ring-surface-2/90",
          "transition-colors duration-200",
          "group-hover:ring-signal/45 group-hover:shadow-none",
          sizeClasses.container,
        )}
      >
        {/* Zenkai vector mark */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 884 457"
          role="img"
          aria-label="Zenkai logo mark"
          className="relative z-10 size-full"
        >
          <path
            fill="#b8102a"
            d="M728 0H301L173 151l135-94h254L0 454h577l137-155-144 98H187L728 0Z"
          />
          <path
            fill="rgba(240,240,248,0.92)"
            d="M884 0h-93L248 377h93L884 0Z"
          />
        </svg>
      </div>

      {/* Brand text */}
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-bold tracking-[0.18em] text-signal",
            sizeClasses.text,
          )}
        >
          ZEN
          <span
            className="relative inline-block mx-1"
            style={{ color: "#b8102a" }}
          >
            KAI
          </span>
        </span>
        <span
          className={cn(
            "font-semibold tracking-[0.20em] text-ink-3/60",
            sizeClasses.sub,
          )}
        >
          WATCH · READ · DISCOVER
        </span>
      </div>
    </Link>
  );
}