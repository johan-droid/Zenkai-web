import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { navSections } from "@/config/nav";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="relative mt-16 border-t border-white/[0.08]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 px-4 py-10 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
        <div className="flex max-w-xs flex-col gap-4">
          <Brand />
          <p className="text-sm leading-relaxed text-ink-3">
            {siteConfig.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-12 gap-y-8">
          {navSections.map((section, index) => (
            <div key={section.title ?? index} className="flex flex-col gap-2.5">
              <p className="font-mono text-[0.58rem] font-medium uppercase tracking-[0.2em] text-ink-3">
                {section.title ?? "Browse"}
              </p>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-sm text-ink-2 transition-colors duration-150 hover:text-ink-1"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-1.5 border-t border-white/[0.06] px-4 pt-5 pb-24 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:pb-6 lg:px-8">
        <p>
          © {new Date().getFullYear()} {siteConfig.name}. Metadata from AniList, Jikan and MangaDex.
        </p>
        <p className="max-w-xl text-ink-3/70">
          Zenkai hosts no content and is not affiliated with any provider. Everything you save stays on your device.
        </p>
      </div>
    </footer>
  );
}
