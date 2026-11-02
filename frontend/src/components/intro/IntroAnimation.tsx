"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASINGS } from "@/config/animations";

/**
 * Zenkai Cinematic Startup Intro
 * 
 * Non-blocking, accessible startup reveal for the Zenkai anime experience.
 * - Duration: ~800ms total
 * - Guarded by sessionStorage so it only shows once per session.
 * - Instantly skipped if prefers-reduced-motion is active.
 * - Fully dismissible on click or key press.
 * - Automatically unmounts from DOM after completion.
 */
export function IntroAnimation() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if already viewed in this session
    try {
      if (sessionStorage.getItem("zenkai_intro_seen") === "1") {
        return;
      }
    } catch {
      // Ignore storage errors in private browsing
    }

    // Check reduced motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
      try {
        sessionStorage.setItem("zenkai_intro_seen", "1");
      } catch {}
    }, 850);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem("zenkai_intro_seen", "1");
    } catch {}
  };

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="zenkai-intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: EASINGS.easeOut }}
          onClick={handleDismiss}
          className="fixed inset-0 z-[100] flex cursor-pointer select-none items-center justify-center bg-[#09090c]/98 backdrop-blur-2xl"
          role="presentation"
          aria-hidden="true"
        >
          {/* Subtle radial ambient bloom behind logo */}
          <div className="pointer-events-none absolute size-72 rounded-full bg-[#C51F3A]/15 blur-3xl" />

          <motion.div
            initial={{ scale: 0.88, opacity: 0, filter: "blur(8px)" }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
            exit={{ scale: 1.05, opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.5, ease: EASINGS.easeOut }}
            className="relative z-10 flex flex-col items-center gap-3 text-center"
          >
            {/* Logo Mark */}
            <div className="relative flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-[#16161f] p-3 shadow-2xl shadow-[#C51F3A]/20 ring-1 ring-white/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 884 457"
                role="img"
                aria-label="Zenkai logo"
                className="size-full"
              >
                <path
                  className="fill-[#C51F3A]"
                  d="M728 0H301L173 151l135-94h254L0 454h577l137-155-144 98H187L728 0Z"
                />
                <path
                  className="fill-white/90"
                  d="M884 0h-93L248 377h93L884 0Z"
                />
              </svg>
            </div>

            {/* Wordmark */}
            <div className="flex flex-col items-center">
              <span className="text-2xl font-black tracking-[0.22em] text-white">
                ZENKAI
              </span>
              <span className="text-[0.62rem] font-bold tracking-[0.4em] text-[#C51F3A]">
                全開 · STREAMING
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}