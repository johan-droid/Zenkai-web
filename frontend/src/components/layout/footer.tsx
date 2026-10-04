import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { navSections } from "@/config/nav";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-glass-border">
      <div className="glass mx-auto flex w-full max-w-[1600px] flex-col gap-8 rounded-t-3xl px-6 py-10 sm:flex-row sm:justify-between">
        <div className="flex max-w-sm flex-col gap-3">
          <Brand />
          <p className="text-sm text-muted-foreground">{siteConfig.description}</p>
        </div>

        <div className="flex flex-wrap gap-10">
          {navSections.map((section, index) => (
            <div key={section.title ?? index} className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {section.title ?? "Browse"}
              </p>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2 px-6 pb-24 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:pb-6">
        <p>
          © {new Date().getFullYear()} {siteConfig.name}. Metadata from AniList, Jikan and MangaDex.
        </p>
        <p className="max-w-xl text-muted-foreground/70">
          Zenkai hosts no content and is not affiliated with any provider. Everything you save stays
          on your device.
        </p>
      </div>
    </footer>
  );
}
