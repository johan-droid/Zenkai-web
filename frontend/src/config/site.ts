/** Site-wide constants used for metadata, the shell and links. */
export const siteConfig = {
  name: "Zenkai",
  tagline: "WATCH · READ · DISCOVER",
  description:
    "Anime, manga and novels in one focused place. Discover, track and pick up where you left off — no login required.",
  url: "https://zenkai.app",
  /**
   * Verified destinations only. Discord and Telegram were removed here because
   * they held bare-domain placeholders (`discord.gg`, `t.me`) rather than real
   * invite or profile URLs — a link in the footer must never be a guess.
   */
  links: {
    github: "https://github.com/Nyyrox/Zenkai",
  },
} as const;

export const STORAGE_KEYS = {
  settings: "zenkai.settings",
  player: "zenkai.player",
  reader: "zenkai.reader",
} as const;

export const PAGE_SIZE = 30;
