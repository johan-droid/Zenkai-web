import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { personalNav, primaryNav, type NavItem } from "@/config/nav";
import { siteConfig } from "@/config/site";

/**
 * Global footer — deliberately small: brand, two real navigation landmarks,
 * one verified external link, and the legal row.
 *
 * Kept a server component so the shell stays static. Nothing here links to a
 * route that does not exist: there is no About, Help, Contact, Privacy or
 * Terms page, and no verified Discord or Telegram account, so none of them
 * appear.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-16 border-t border-line/70">
      <div className="mx-auto w-full max-w-[1440px] px-4 pt-12 pb-10 sm:px-6 lg:px-8">
        {/* Two link columns sit side by side from the smallest phone up —
            stacking them made the footer nearly a full screen tall. The brand
            block spans both until there is room for a third column. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-10 lg:grid-cols-[minmax(0,24rem)_auto_auto] lg:gap-x-20">
          <div className="col-span-2 flex max-w-sm flex-col gap-4 lg:col-span-1">
            <Brand />
            <p className="text-sm leading-relaxed text-ink-2">
              {siteConfig.description}
            </p>
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-sm text-ink-3 underline-offset-4 transition-colors duration-150 hover:text-ink-1 hover:underline"
            >
              View Zenkai on GitHub
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>

          <FooterNavGroup title="Explore" items={primaryNav} />
          <FooterNavGroup title="Account" items={personalNav} />
        </div>
      </div>

      <div className="border-t border-line/60">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-1.5 px-4 pt-5 pb-[calc(3.5rem+env(safe-area-inset-bottom))] text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:pb-6 lg:px-8">
          <p>
            © {year} {siteConfig.name}. Metadata from AniList, Jikan and MangaDex.
          </p>
          <p className="max-w-xl text-ink-3/70">
            Zenkai hosts no content and is not affiliated with any provider.
            Everything you save stays on your device.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterNavGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-3">
      <p className="font-mono text-[0.6rem] font-medium tracking-[0.2em] text-ink-3 uppercase">
        {title}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="inline-flex min-h-8 items-center text-sm text-ink-2 transition-colors duration-150 hover:text-ink-1"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
