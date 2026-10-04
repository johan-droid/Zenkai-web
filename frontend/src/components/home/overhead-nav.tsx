"use client";

import { useEffect, useState } from "react";
import { Flame, Clock, Calendar, Trophy, Tags, BookOpen, Rocket, Sparkles, Filter } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface NavSectionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const SECTIONS: NavSectionItem[] = [
  { id: "hero", label: "Featured", icon: Sparkles },
  { id: "trending", label: "Trending", icon: Flame, badge: "Hot" },
  { id: "continue", label: "Continue", icon: Clock },
  { id: "seasonal", label: "This Season", icon: Calendar },
  { id: "top-rated", label: "Top Rated", icon: Trophy },
  { id: "genres", label: "Genres", icon: Tags },
  { id: "manga", label: "Manga", icon: BookOpen },
  { id: "upcoming", label: "Upcoming", icon: Rocket },
  { id: "features", label: "Highlights", icon: Filter },
];

export function OverheadNav() {
  const [activeId, setActiveId] = useState<string>("hero");

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 200;

      for (let i = SECTIONS.length - 1; i >= 0; i--) {
        const section = document.getElementById(SECTIONS[i]!.id);
        if (section) {
          const top = section.offsetTop;
          if (scrollPosition >= top) {
            setActiveId(SECTIONS[i]!.id);
            break;
          }
        }
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
      const yOffset = -120; // offset for sticky Hyprland dock + sub-rail
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="sticky top-[4.75rem] z-30 mb-8 flex justify-center">
      <div className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-background/80 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-2xl ring-1 ring-white/5">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeId === section.id;
          return (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={cn(
                "group relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors duration-200 sm:text-xs",
                isActive ? "text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="overhead-rail-pill"
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 30,
                  }}
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 shadow-[0_0_15px_rgba(168,85,247,0.4)] ring-1 ring-white/20"
                />
              )}

              <span className="relative z-10 flex items-center gap-1.5">
                <Icon
                  className={cn(
                    "size-3.5 transition-transform group-hover:scale-110",
                    isActive ? "text-white" : "text-purple-400/80",
                  )}
                />
                <span>{section.label}</span>
                {section.badge ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[0.6rem] font-bold",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30",
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
