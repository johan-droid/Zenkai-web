import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Flat editorial masthead. No glass panel, no corner glow: the page title and
 * its one-line description carry the hierarchy, and a hairline ends the block.
 */
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
        "flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-[clamp(1.9rem,4.6vw,2.75rem)] font-black leading-[1.02] tracking-[-0.035em]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-ink-2">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
