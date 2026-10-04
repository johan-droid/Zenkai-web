/** Site-wide constants used for metadata, the shell and links. */
export const siteConfig = {
  name: "Zenkai",
  tagline: "WATCH · READ · DISCOVER",
  description:
    "Anime, manga and novels in one focused place. Discover, track and pick up where you left off — no login required.",
  url: "https://zenkai.app",
  links: {
    github: "https://github.com/Nyyrox/Zenkai",
    discord: "https://discord.gg",
    telegram: "https://t.me",
  },
} as const;

export const STORAGE_KEYS = {
  settings: "zenkai.settings",
  player: "zenkai.player",
  reader: "zenkai.reader",
} as const;

export const PAGE_SIZE = 30;