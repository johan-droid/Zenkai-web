"use client";

import { useEffect, useState } from "react";
import { Flame, Clock, Calendar, Trophy, Tags, BookOpen, Rocket, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavSectionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const SECTIONS: NavSectionItem[] = [
  { id: "hero", label: "Featured", icon: Sparkles },
  { id: "trending", label: "Trending", badge: "Hot", icon: Flame },
  { id: "continue", label: "Continue", icon: Clock },
  { id: "seasonal", label: "This Season", icon: Calendar },
  { id: "top-rated", label: "Top Rated", icon: Trophy },
  { id: "genres", label: "Genres", icon: Tags },
  { id: "manga", label: "Manga", icon: BookOpen },
  { id: "upcoming", label: "Upcoming", icon: Rocket },
];

export function OverheadNav() {
  const [activeId, setActiveId] = useState<string>("hero");

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollPosition = window.scrollY + 200;
          for (let i = SECTIONS.length - 1; i >= 0; i--) {
            const section = document.getElementById(SECTIONS[i]!.id);
            if (section) {
              if (scrollPosition >= section.offsetTop) {
                const targetId = SECTIONS[i]!.id;
                setActiveId((prev) => (prev !== targetId ? targetId : prev));
                break;
              }
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setActiveId(id);
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="sticky top-[3.5rem] z-20 mb-6 flex justify-center">
      <div
        className={[
          "no-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto",
          "rounded-lg border border-white/[0.05]",
          "bg-[#0f0f14]/90 p-1",
        ].join(" ")}
      >
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeId === section.id;

          return (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={cn(
                "group relative flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1",
                "text-xs font-medium tracking-wider",
                "transition-colors duration-150",
                isActive ? "text-white" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {/* Subtle active indicator – thin accent line */}
              {isActive && (
                <span className="absolute inset-x-0 bottom-0.5 rounded-lg h-0.5 bg-white/10"/>
              )}

              {/* Icon + label */}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon
                  className={cn(
                    "size-3.5 transition-all duration-150",
                    isActive ? "text-[#c8102a]" : "text-zinc-400",
                  )}
                />
                <span>{section.label}</span>
                {section.badge ? (
                  <span
                    className={cn(
                      "rounded-full text-[0.48rem] font-bold",
                      isActive ? "bg-white/10 text-white" : "bg-white/5 text-zinc-300/80",
                    )}
                  >
                    {section.badge}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
