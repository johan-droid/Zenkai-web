import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden flex flex-col gap-4 rounded-2xl sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        "border border-white/[0.07] bg-white/[0.025] backdrop-blur-md",
        "px-5 py-5 sm:px-7 sm:py-6",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_16px_40px_-16px_rgba(0,0,0,0.8)]",
        className,
      )}
    >
      {/* Subtle crimson corner accent */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-[#b8102a]/08 blur-3xl" />

      <div className="relative flex flex-col gap-1.5">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="relative flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}

      {/* Bottom inset highlight */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
    </div>
  );
}
