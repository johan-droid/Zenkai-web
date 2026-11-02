"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { EASINGS } from "@/config/animations";

export default function MainTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hasMounted, setHasMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    // Skip the enter animation on first paint only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true);
  }, []);

  if (shouldReduceMotion) {
    return <div className="flex-1 w-full">{children}</div>;
  }

  return (
    <motion.div
      key={pathname}
      initial={hasMounted ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{
        duration: 0.24,
        ease: EASINGS.easeOut,
      }}
      className="flex-1 w-full"
    >
      {children}
    </motion.div>
  );
}
