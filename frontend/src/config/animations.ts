/**
 * Zenkai Motion Design System
 * 
 * Reusable animation variants, spring physics, and transition curves
 * built on Motion for React (motion/react).
 * 
 * Philosophy: Purposeful, swift, non-distracting motion that elevates
 * the cinematic anime experience without causing motion sickness or layout lag.
 */

import type { Transition, Variants } from "motion/react";

// Standard Zenkai easing curves
export const EASINGS = {
  // Swift decelerate for entrances (Hyprland / iOS feel)
  easeOut: [0.16, 1, 0.3, 1] as const,
  // Snappy accelerate for exits
  easeIn: [0.7, 0, 0.84, 0] as const,
  // Balanced standard curve
  easeInOut: [0.4, 0, 0.2, 1] as const,
  // Snappy spring config
  spring: { type: "spring", stiffness: 380, damping: 28 } as const,
  gentleSpring: { type: "spring", stiffness: 220, damping: 22 } as const,
};

// Standard transition definitions
export const TRANSITIONS = {
  micro: { duration: 0.15, ease: EASINGS.easeOut } satisfies Transition,
  short: { duration: 0.22, ease: EASINGS.easeOut } satisfies Transition,
  medium: { duration: 0.32, ease: EASINGS.easeOut } satisfies Transition,
  page: { duration: 0.28, ease: EASINGS.easeOut } satisfies Transition,
  spring: EASINGS.spring satisfies Transition,
};

// Fade and lift animation for cards and items
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: TRANSITIONS.short,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: TRANSITIONS.micro,
  },
};

// Subtle fade in
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: TRANSITIONS.short,
  },
  exit: {
    opacity: 0,
    transition: TRANSITIONS.micro,
  },
};

// Scale & fade for modals, dialogs and popovers
export const scaleFade: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: EASINGS.spring,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: TRANSITIONS.micro,
  },
};

// Slide in from bottom (for mobile sheets, drawers, notifications)
export const slideUpDrawer: Variants = {
  hidden: { y: "100%", opacity: 0.6 },
  visible: {
    y: 0,
    opacity: 1,
    transition: EASINGS.gentleSpring,
  },
  exit: {
    y: "100%",
    opacity: 0,
    transition: { duration: 0.2, ease: EASINGS.easeIn },
  },
};

// Stagger container for list reveals
export const staggerContainer = (staggerChildren = 0.04, delayChildren = 0): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren,
      delayChildren,
    },
  },
});
