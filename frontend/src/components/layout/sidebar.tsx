"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navSections, isActivePath } from "@/config/nav";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 py-6 pr-2 lg:block">
      <div className="glass-panel sticky top-24 flex flex-col gap-6 rounded-2xl p-3">
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
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "glass text-foreground"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 transition-colors",
                      active ? "text-brand-400" : "group-hover:text-brand-400",
                    )}
                  />
                  <span className="flex flex-col">
                    <span>{item.label}</span>
                    {item.description ? (
                      <span className="text-[0.7rem] font-normal text-muted-foreground/70">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
