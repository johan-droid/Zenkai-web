"use client";

import { useEffect, useState } from "react";
import { Flame, Clock, Calendar, Trophy, Tags, BookOpen, Rocket, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface NavSectionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const SECTIONS: NavSectionItem[] = [
  { id: "hero",     label: "Featured",    icon: Sparkles                  },
  { id: "trending", label: "Trending",    icon: Flame,   badge: "Hot"     },
  { id: "continue", label: "Continue",    icon: Clock                     },
  { id: "seasonal", label: "This Season", icon: Calendar                  },
  { id: "top-rated",label: "Top Rated",   icon: Trophy                    },
  { id: "genres",   label: "Genres",      icon: Tags                      },
  { id: "manga",    label: "Manga",        icon: BookOpen                  },
  { id: "upcoming", label: "Upcoming",    icon: Rocket                    },
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
      const yOffset = -120;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="sticky top-[4.25rem] z-30 mb-8 flex justify-center">
      <div
        className={[
          "no-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto",
          "rounded-2xl border border-white/[0.07]",
          "bg-[#07070c]/88 p-1.5",
          "shadow-[0_8px_40px_rgba(0,0,0,0.75),0_1px_0_0_rgba(255,255,255,0.05)_inset]",
          "backdrop-blur-2xl",
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
                "group relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5",
                "text-xs font-semibold tracking-wide",
                "transition-colors duration-200",
                isActive ? "text-white" : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              {/* Animated active pill */}
              {isActive && (
                <motion.div
                  layoutId="overhead-rail-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  className={[
                    "absolute inset-0 rounded-xl",
                    "bg-gradient-to-b from-[#c8102a]/70 to-[#8a0d1e]/80",
                    "shadow-[0_2px_12px_rgba(184,16,42,0.45),0_1px_0_0_rgba(255,255,255,0.12)_inset]",
                    "ring-1 ring-[#b8102a]/40",
                  ].join(" ")}
                />
              )}

              {/* Icon + label */}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon
                  className={cn(
                    "size-3.5 transition-all duration-200",
                    isActive
                      ? "text-white"
                      : "text-zinc-500 group-hover:text-rose-400/80 group-hover:scale-110",
                  )}
                />
                <span>{section.label}</span>
                {section.badge ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[0.58rem] font-bold",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-rose-500/18 text-rose-300/90 ring-1 ring-rose-500/25",
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
