"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";

export default function MainTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    // Skip the enter animation on first paint only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true);
  }, []);

  return (
    <motion.div
      key={pathname}
      initial={hasMounted ? { opacity: 0, y: 12, filter: "blur(6px)" } : false}
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

