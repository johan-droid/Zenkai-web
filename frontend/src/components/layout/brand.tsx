"use client";

import { motion } from "motion/react";
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
      <motion.div
        whileHover={{ scale: 1.07, rotate: [0, -1.5, 1.5, 0] }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className={cn(
          "relative flex items-center justify-center overflow-hidden",
          "bg-gradient-to-br from-[#141420] via-[#1a1a28] to-[#09090e]",
          "shadow-[0_4px_20px_rgba(0,0,0,0.7)]",
          "ring-1 ring-white/[0.08]",
          "transition-all duration-350",
          "group-hover:ring-[#b8102a]/50",
          "group-hover:shadow-[0_0_28px_rgba(184,16,42,0.55),0_4px_20px_rgba(0,0,0,0.7)]",
          sizeClasses.container,
        )}
      >
        {/* Shimmer sweep on hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-full top-0 block h-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition-all duration-700 ease-out group-hover:translate-x-full group-hover:opacity-100"
        />

        {/* Ambient pulsing glow */}
        <motion.div
          animate={{ opacity: [0.35, 0.70, 0.35], scale: [0.92, 1.08, 0.92] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute inset-0 rounded-inherit"
          style={{
            background: "radial-gradient(circle at center, rgba(184,16,42,0.28) 0%, transparent 65%)",
          }}
        />

        {/* Zenkai vector mark */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 884 457"
          role="img"
          aria-label="Zenkai logo mark"
          className="relative z-10 size-full"
          style={{ filter: "drop-shadow(0 0 8px rgba(184,16,42,0.65))" }}
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
      </motion.div>

      {/* Brand text */}
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-black tracking-[0.18em] text-white/95",
            "transition-all duration-300",
            "group-hover:tracking-[0.22em]",
            sizeClasses.text,
          )}
        >
          ZEN
          <span
            className="text-[#d42035]"
            style={{ textShadow: "0 0 10px rgba(212,32,53,0.55)" }}
          >
            KAI
          </span>
        </span>
        <span
          className={cn(
            "font-semibold tracking-[0.20em] text-zinc-500",
            "transition-colors duration-300",
            "group-hover:text-zinc-300",
            sizeClasses.sub,
          )}
        >
          WATCH · READ · DISCOVER
        </span>
      </div>
    </Link>
  );
}
