/** 
 * Zenkai Design Tokens — Cinematic Anime-Inspired Visual Language
 * 
 * Color palette inspired by anime aesthetics: crimson accents, deep backgrounds,
 * ethereal accents. Carefully balanced for accessibility and cinematic feel.
 */

export const tokens = {
  // === Color Palette ===
  colors: {
    // Primary anime crimson accent - used for highlights, interactive elements
    crimson: {
      50: "#FFF0F0",
      100: "#FFE4E4",
      200: "#FFC8C8",
      300: "#FFACAC",
      400: "#FF8A8A",
      500: "#FF5252", /**< Primary action, links, crimson accent */
      600: "#E53935",
      700: "#D32F2F",
      800: "#B71C1C",
      900: "#7B1F1F",
      950: "#4A0F0F",
    },
    // Deep navy/black backgrounds - cinematic feel
    navy: {
      50: "#F0F4F8",
      100: "#E4E8F0",
      200: "#D0D8E8",
      300: "#A8B0C0",
      400: "#7888A0",
      500: "#4A6578",
      600: "#2D4050",
      700: "#1E2E3E",
      800: "#0F1B25",
      900: "#080C12",
      950: "#040608",
    },
    // White and light surfaces
    white: {
      50: "#FAFAFF",
      100: "#F5F5FF",
      200: "#E5E5F0",
      300: "#D0D0E0",
      400: "#A0A0B0",
      500: "#707080",
    },
    // Ethereal accent colors for seasonal/theme variations
    accent: {
      morning: "#FFB74D",   /**< Sunrise/orange accent */
      evening: "#8C1C92",   /**< Purple evening accent */
      night: "#18FFFF",     /**< Cyber blue accent */
      forest: "#00E676",    /**< Green accent */
      midnight: "#0D47A1",  /**< Deep blue accent */
    },
    // UI grays
    gray: {
      50: "#FAFAFA",
      100: "#F5F5F5",
      200: "#EEEEEE",
      300: "#E0E0E0",
      400: "#B0B0B0",
      500: "#757575",
      600: "#606060",
      700: "#454545",
      800: "#212121",
      900: "#121212",
      950: "#080808",
    },
    // Status colors
    status: {
      success: "#4CAF50",
      warning: "#FFC107",
      error: "#F44336",
      info: "#2196F3",
    },
    // Transparent and overlay
    overlay: "rgba(10, 10, 15, 0.8)",
    modalOverlay: "rgba(0, 0, 0, 0.7)",
    toastBackground: "#212121",
    toastSuccess: "#4CAF50",
    toastError: "#F44336",
  },

  // === Typography ===
  typography: {
    fontFamily: {
      // Primary: Cinematic serif for headings, reminiscent of anime credits
      heading: "'Merriweather', 'Playfair Display', serif",
      // Secondary: Clean sans-serif for UI body
      body: "'Inter', 'System UI', -apple-system, sans-serif",
      // Monospace for numbers/timestamps
      mono: "'Roboto Mono', 'Fira Code', monospace",
    },
    fontSize: {
      xs: ["0.75rem", { lineHeight: "1rem" }],
      sm: ["0.875rem", { lineHeight: "1.25rem" }],
      base: ["1rem", { lineHeight: "1.5rem" }],
      lg: ["1.125rem", { lineHeight: "1.75rem" }],
      xl: ["1.25rem", { lineHeight: "1.75rem" }],
      "2xl": ["1.5rem", { lineHeight: "2rem" }],
      "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
      "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
      "5xl": ["3rem", { lineHeight: "1" }],
      "6xl": ["3.75rem", { lineHeight: "1" }],
      "7xl": ["4.5rem", { lineHeight: "1" }],
    },
    fontWeight: {
      thin: 100,
      extralight: 200,
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900,
    },
    // Line heights by segment
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
      block: 2,
    },
  },

  // === Spacing & Layout ===
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    "2xl": 48,
    "3xl": 64,
    "4xl": 80,
  },

  // === Border Radius ===
  radius: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    "2xl": 24,
    full: 9999,
  },

  // === Shadows ===
  shadow: {
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    crimson: "0 4px 12px 0 rgba(255, 82, 82, 0.3), 0 6px 20px 0 rgba(255, 82, 82, 0.2)",
    none: "none",
  },

  // === Transitions ===
  transition: {
    fastest: "150ms ease-out",
    faster: "200ms ease-out",
    fast: "250ms ease-out",
    normal: "300ms ease-out",
    slow: "400ms ease-out",
    slower: "500ms ease-out",
    enter: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
    exit: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // === Z-Index ===
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1020,
    modal: 1030,
    popover: 1040,
    tooltip: 1050,
    toast: 1060,
    overlay: 1070,
  },

  // === Breakpoints for Responsive ===
  breakpoints: {
    xs: "320px",   /**< Mobile phones */
    sm: "640px",   /**< Small phones */
    md: "768px",   /**< Tablets */
    lg: "1024px",  /**< Small desktops */
    xl: "1280px",  /**< Desktops */
    "2xl": "1536px", /**< Large desktops */
  },
};

/** 
 * Color utility - expands shorthand color references 
 * Used in CSS-in-JS or styled-components
 */
export function color(token: keyof typeof tokens.colors): string {
  return tokens.colors[token] as string;
}

/** 
 * Responsive utility - returns CSS based on breakpoint 
 */
export function at(breakpoint: keyof typeof tokens.breakpoints): string {
  const size = tokens.breakpoints[breakpoint as keyof typeof tokens.breakpoints];
  return `@media (min-width: ${size})`;
}