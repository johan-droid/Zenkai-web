import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZENKAI — Anime, Manga & Novels",
    short_name: "ZENKAI",
    description: "Stream anime, read manga and novels ad-free in high definition with CinePlayer.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["entertainment", "multimedia", "books"],
    icons: [
      {
        src: "/assets/app_logo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/zenkai-logo-transparent.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/assets/zenkai-logo-transparent.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Anime",
        short_name: "Anime",
        description: "Browse anime catalogue",
        url: "/anime",
        icons: [{ src: "/assets/zenkai-logo-transparent.svg", sizes: "any" }],
      },
      {
        name: "Manga",
        short_name: "Manga",
        description: "Browse manga catalogue",
        url: "/manga",
        icons: [{ src: "/assets/zenkai-logo-transparent.svg", sizes: "any" }],
      },
      {
        name: "Schedule",
        short_name: "Schedule",
        description: "Weekly release schedule",
        url: "/schedule",
        icons: [{ src: "/assets/zenkai-logo-transparent.svg", sizes: "any" }],
      },
      {
        name: "Library",
        short_name: "Library",
        description: "Your saved lists",
        url: "/library",
        icons: [{ src: "/assets/zenkai-logo-transparent.svg", sizes: "any" }],
      },
    ],
  };
}
