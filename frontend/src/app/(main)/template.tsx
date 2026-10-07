"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";

export default function MainTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
      transition={{
        duration: 0.32,
        ease: [0.16, 1, 0.3, 1], // Smooth Hyprland curve
      }}
      className="flex-1 w-full"
    >
      {children}
    </motion.div>
  );
}
