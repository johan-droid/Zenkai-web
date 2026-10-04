"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

export default function MainTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
      transition={{
        duration: 0.35,
        ease: [0.16, 1, 0.3, 1], // Smooth Hyprland bezier curve
      }}
      className="flex-1 w-full"
    >
      {children}
    </motion.div>
  );
}
