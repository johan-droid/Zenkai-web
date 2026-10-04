import Link from "next/link";

import { cn } from "@/lib/utils";

export function Brand({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("group flex items-center gap-2.5 rounded-xl outline-none", className)}
      aria-label="Zenkai home"
    >
      <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 shadow-lg shadow-brand-700/30">
        <span className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        <span className="relative text-base font-black tracking-tighter text-white">Z</span>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-gradient text-lg font-black tracking-[0.18em]">ZENKAI</span>
        <span className="text-[0.55rem] font-medium tracking-[0.24em] text-muted-foreground/80">
          WATCH · READ
        </span>
      </span>
    </Link>
  );
}
