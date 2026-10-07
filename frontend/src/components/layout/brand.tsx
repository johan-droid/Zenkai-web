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
    sm: { container: "size-8 rounded-lg p-1", text: "text-base", sub: "text-[0.48rem]" },
    md: { container: "size-9 rounded-xl p-1.5", text: "text-lg", sub: "text-[0.52rem]" },
    lg: { container: "size-12 rounded-2xl p-2", text: "text-2xl", sub: "text-[0.62rem]" },
  }[size];

  return (
    <Link
      href={href}
      className={cn("group flex items-center gap-2.5 outline-none select-none", className)}
      aria-label="Zenkai home"
    >
      {/* Animated Logo Container with Spring Motion & Energy Glow */}
      <motion.div
        whileHover={{ scale: 1.08, rotate: [0, -2, 2, 0] }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 420, damping: 22 }}
        className={cn(
          "relative flex items-center justify-center bg-gradient-to-br from-[#12121a] via-[#1a1a26] to-[#07070a] shadow-lg ring-1 ring-white/10 overflow-hidden transition-all duration-300 group-hover:ring-[#c8102e]/60 group-hover:shadow-[0_0_24px_rgba(200,16,46,0.65)]",
          sizeClasses.container,
        )}
      >
        {/* Specular Glare Shimmer Sweep on Hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-full top-0 block h-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-all duration-700 ease-out group-hover:translate-x-full group-hover:opacity-100"
        />

        {/* Ambient Pulsing Glow Backdrop */}
        <motion.div
          animate={{
            opacity: [0.4, 0.8, 0.4],
            scale: [0.95, 1.05, 0.95],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="pointer-events-none absolute inset-0 rounded-xl bg-radial from-[#c8102e]/30 via-transparent to-transparent"
        />

        {/* Zenkai Vector Emblem */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 884 457"
          role="img"
          aria-label="Zenkai logo"
          className="relative z-10 size-full drop-shadow-[0_0_10px_rgba(200,16,46,0.7)]"
        >
          {/* Main Crimson Path */}
          <motion.path
            fill="#c8102e"
            d="M728 0H301L173 151l135-94h254L0 454h577l137-155-144 98H187L728 0Z"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
          />

          {/* Slashed White Path */}
          <motion.path
            fill="#f2f2f2"
            d="M884 0h-93L248 377h93L884 0Z"
            whileHover={{ x: 2, y: -2 }}
            transition={{ type: "spring", stiffness: 400 }}
          />
        </svg>
      </motion.div>

      {/* Brand Typography */}
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-black tracking-[0.18em] text-white transition-all duration-300 group-hover:tracking-[0.22em]",
            sizeClasses.text,
          )}
        >
          ZEN<span className="text-[#e52545] drop-shadow-[0_0_8px_rgba(229,37,69,0.7)]">KAI</span>
        </span>
        <span
          className={cn(
            "font-bold tracking-[0.22em] text-zinc-400 transition-colors group-hover:text-zinc-200",
            sizeClasses.sub,
          )}
        >
          WATCH · READ · DISCOVER
        </span>
      </div>
    </Link>
  );
}
