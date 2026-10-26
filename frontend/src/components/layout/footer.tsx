import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { navSections } from "@/config/nav";
import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="relative mt-20 overflow-hidden border-t border-white/[0.05]">
      {/* Matte glass footer panel */}
      <div
        className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-10 rounded-t-3xl px-6 py-10 sm:flex-row sm:justify-between"
        style={{
          background: "rgba(8,8,13,0.82)",
          backdropFilter: "blur(24px) saturate(130%)",
          WebkitBackdropFilter: "blur(24px) saturate(130%)",
          boxShadow: "0 1px 0 0 rgba(255,255,255,0.05) inset",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Subtle corner glow */}
        <div className="pointer-events-none absolute -top-16 -left-16 h-40 w-40 rounded-full bg-[#b8102a]/05 blur-3xl" />

        {/* Brand + description */}
        <div className="flex max-w-xs flex-col gap-4">
          <Brand />
          <p className="text-sm leading-relaxed text-muted-foreground/80">
            {siteConfig.description}
          </p>
          {/* Mini accent line */}
          <span className="h-px w-12 rounded-full bg-gradient-to-r from-[#b8102a]/60 to-transparent" />
        </div>

        {/* Nav columns */}
        <div className="flex flex-wrap gap-10">
          {navSections.map((section, index) => (
            <div key={section.title ?? index} className="flex flex-col gap-2.5">
              <p className="text-[0.65rem] font-bold tracking-[0.15em] text-muted-foreground/60 uppercase">
                {section.title ?? "Browse"}
              </p>
              <div className="flex flex-col gap-1.5">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-sm text-muted-foreground/80 transition-colors duration-200 hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Copyright strip */}
      <div
        className="mx-auto flex w-full max-w-[1600px] flex-col gap-1.5 border-t border-white/[0.04] px-6 pb-24 pt-5 text-xs text-muted-foreground/60 sm:flex-row sm:items-center sm:justify-between lg:pb-6"
        style={{
          background: "rgba(6,6,10,0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <p>
          © {new Date().getFullYear()} {siteConfig.name}. Metadata from AniList, Jikan and MangaDex.
        </p>
        <p className="max-w-xl text-muted-foreground/40">
          Zenkai hosts no content and is not affiliated with any provider. Everything you save stays on your device.
        </p>
      </div>
    </footer>
  );
}
