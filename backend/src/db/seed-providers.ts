/**
 * Seed streaming providers from Zenkai Android specification.
 */
import "dotenv/config";
import postgres from "postgres";

const url =
  process.env.DATABASE_URL ??
  "postgresql://zenkai:zenkai_password@localhost:5432/zenkai_db?sslmode=disable";

interface RawProviderRow {
  rawId: string;
  providerSlug: string;
  endpointSlug: string;
  providerName: string;
  displayName: string;
  pattern: string;
  serverBadge: string;
  isDirectStream: boolean;
  isEmbedOnly: boolean;
  isMultiAudio: boolean;
  isActive: boolean;
  sortOrder: number;
}

const RAW_ROWS: RawProviderRow[] = [
  {
    rawId: "reanime-sub",
    providerSlug: "reanime",
    endpointSlug: "sub",
    providerName: "Re:Anime",
    displayName: "Re:Anime",
    pattern: "https://reanime.to",
    serverBadge: "Direct HD",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    rawId: "anikoto-sub",
    providerSlug: "anikoto",
    endpointSlug: "sub",
    providerName: "Anikoto",
    displayName: "Anikoto",
    pattern: "https://anikoto.to",
    serverBadge: "Direct HD",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 2,
  },
  {
    rawId: "anineko-sub",
    providerSlug: "anineko",
    endpointSlug: "sub",
    providerName: "Anineko",
    displayName: "Anineko",
    pattern: "https://anineko.to",
    serverBadge: "Direct HLS",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 3,
  },
  {
    rawId: "anibd-sub",
    providerSlug: "anibd",
    endpointSlug: "sub",
    providerName: "AniBD",
    displayName: "AniBD",
    pattern: "https://anibd.net",
    serverBadge: "Fast CDN",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 4,
  },
  {
    rawId: "animegg-sub",
    providerSlug: "animegg",
    endpointSlug: "sub",
    providerName: "AnimeGG",
    displayName: "AnimeGG",
    pattern: "https://animegg.org",
    serverBadge: "Direct MP4",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 5,
  },
  {
    rawId: "kaa-sub",
    providerSlug: "kaa",
    endpointSlug: "sub",
    providerName: "KickAssAnime",
    displayName: "KickAssAnime",
    pattern: "https://kickassanime.mx",
    serverBadge: "Direct HD",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 6,
  },
  {
    rawId: "yumezone-zoko-direct-sub",
    providerSlug: "yumezone",
    endpointSlug: "zoko-direct-sub",
    providerName: "YumeZone",
    displayName: "Zoko HD",
    pattern: "https://yumezone.qzz.io/api/zoko/source?mal={mal_id}&ani={anilist_id}&ep={episode}&lang=sub",
    serverBadge: "Direct HD",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 7,
  },
  {
    rawId: "reanime-dub",
    providerSlug: "reanime",
    endpointSlug: "dub",
    providerName: "Re:Anime",
    displayName: "Re:Anime Dub",
    pattern: "https://reanime.to",
    serverBadge: "Direct HD",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 8,
  },
  {
    rawId: "anikoto-dub",
    providerSlug: "anikoto",
    endpointSlug: "dub",
    providerName: "Anikoto",
    displayName: "Anikoto Dub",
    pattern: "https://anikoto.to",
    serverBadge: "Direct HD",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 9,
  },
  {
    rawId: "anineko-dub",
    providerSlug: "anineko",
    endpointSlug: "dub",
    providerName: "Anineko",
    displayName: "Anineko Dub",
    pattern: "https://anineko.to",
    serverBadge: "Direct HLS",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 10,
  },
  {
    rawId: "animegg-dub",
    providerSlug: "animegg",
    endpointSlug: "dub",
    providerName: "AnimeGG",
    displayName: "AnimeGG Dub",
    pattern: "https://animegg.org",
    serverBadge: "Direct MP4",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 11,
  },
  {
    rawId: "yumezone-zoko-direct-dub",
    providerSlug: "yumezone",
    endpointSlug: "zoko-direct-dub",
    providerName: "YumeZone",
    displayName: "Zoko HD Dub",
    pattern: "https://yumezone.qzz.io/api/zoko/source?mal={mal_id}&ani={anilist_id}&ep={episode}&lang=dub",
    serverBadge: "Direct HD",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 12,
  },
  {
    rawId: "animesalt-multi",
    providerSlug: "animesalt",
    endpointSlug: "multi",
    providerName: "AnimeSalt (acdn)",
    displayName: "AnimeSalt Multi",
    pattern: "https://animesalt.cx",
    serverBadge: "Multi-Audio",
    isDirectStream: true,
    isEmbedOnly: false,
    isMultiAudio: true,
    isActive: true,
    sortOrder: 13,
  },
  {
    rawId: "megaplay-sub",
    providerSlug: "megaplay",
    endpointSlug: "sub",
    providerName: "Megaplay",
    displayName: "Megaplay",
    pattern: "https://megaplay.buzz/stream/mal/{mal_id}/{episode}/sub?autonext=1&autoskip=1",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 14,
  },
  {
    rawId: "megaplay-s2-sub",
    providerSlug: "megaplay",
    endpointSlug: "s2-sub",
    providerName: "Megaplay",
    displayName: "Vidstream",
    pattern: "https://megaplay.buzz/stream/mal/{mal_id}/{episode}/sub?server=vidstream&autonext=1&autoskip=1",
    serverBadge: "Megaplay S2",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 15,
  },
  {
    rawId: "recloud-sub",
    providerSlug: "recloud",
    endpointSlug: "sub",
    providerName: "ReCloud",
    displayName: "ReCloud",
    pattern: "https://cdn.4animo.xyz/embed/hd-2/ani/{anilist_id}/{episode}/sub?k=1",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 16,
  },
  {
    rawId: "yumezone-megaplay-sub",
    providerSlug: "yumezone",
    endpointSlug: "megaplay-sub",
    providerName: "YumeZone",
    displayName: "YumeZone",
    pattern: "https://yumezone.qzz.io/embed/megaplay/ani/{anilist_id}/{episode}/sub",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 17,
  },
  {
    rawId: "zokoanime-sub",
    providerSlug: "zokoanime",
    endpointSlug: "sub",
    providerName: "ZokoAnime",
    displayName: "ZokoAnime",
    pattern: "https://zokoanime.video/stream/mal/{mal_id}/{episode}/sub?color=35d5bf",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 18,
  },
  {
    rawId: "tryembed-sub",
    providerSlug: "tryembed",
    endpointSlug: "sub",
    providerName: "TryEmbed",
    displayName: "TryEmbed",
    pattern: "https://tryembed.us.cc/e/{mal_id}/{episode}/sub?autonext=1&autoskip=1",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 19,
  },
  {
    rawId: "vidnest-anime-sub",
    providerSlug: "vidnest",
    endpointSlug: "sub",
    providerName: "Vidnest",
    displayName: "Vidnest",
    pattern: "https://vidnest.fun/anime/{id}/{e}/sub",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 20,
  },
  {
    rawId: "megaplay-dub",
    providerSlug: "megaplay",
    endpointSlug: "dub",
    providerName: "Megaplay",
    displayName: "Megaplay Dub",
    pattern: "https://megaplay.buzz/stream/mal/{mal_id}/{episode}/dub?autonext=1&autoskip=1",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 21,
  },
  {
    rawId: "megaplay-s2-dub",
    providerSlug: "megaplay",
    endpointSlug: "s2-dub",
    providerName: "Megaplay",
    displayName: "Vidstream Dub",
    pattern: "https://megaplay.buzz/stream/mal/{mal_id}/{episode}/dub?server=vidstream&autonext=1&autoskip=1",
    serverBadge: "Megaplay S2",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 22,
  },
  {
    rawId: "recloud-dub",
    providerSlug: "recloud",
    endpointSlug: "dub",
    providerName: "ReCloud",
    displayName: "ReCloud Dub",
    pattern: "https://cdn.4animo.xyz/embed/hd-2/ani/{anilist_id}/{episode}/dub?k=1",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 23,
  },
  {
    rawId: "yumezone-megaplay-dub",
    providerSlug: "yumezone",
    endpointSlug: "megaplay-dub",
    providerName: "YumeZone",
    displayName: "YumeZone Dub",
    pattern: "https://yumezone.qzz.io/embed/megaplay/ani/{anilist_id}/{episode}/dub",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 24,
  },
  {
    rawId: "zokoanime-dub",
    providerSlug: "zokoanime",
    endpointSlug: "dub",
    providerName: "ZokoAnime",
    displayName: "ZokoAnime Dub",
    pattern: "https://zokoanime.video/stream/mal/{mal_id}/{episode}/dub?color=35d5bf",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 25,
  },
  {
    rawId: "tryembed-dub",
    providerSlug: "tryembed",
    endpointSlug: "dub",
    providerName: "TryEmbed",
    displayName: "TryEmbed Dub",
    pattern: "https://tryembed.us.cc/e/{mal_id}/{episode}/dub?autonext=1&autoskip=1",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 26,
  },
  {
    rawId: "vidnest-anime-dub",
    providerSlug: "vidnest",
    endpointSlug: "dub",
    providerName: "Vidnest",
    displayName: "Vidnest Dub",
    pattern: "https://vidnest.fun/anime/{id}/{e}/dub",
    serverBadge: "Embed HD",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 27,
  },
  {
    rawId: "yumezone-animesalt-multi",
    providerSlug: "yumezone",
    endpointSlug: "animesalt-multi",
    providerName: "YumeZone",
    displayName: "YumeZone Multi",
    pattern: "https://yumezone.qzz.io/embed/animesalt/ani/{anilist_id}/{episode}/sub",
    serverBadge: "Multi-Audio",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: true,
    isActive: true,
    sortOrder: 28,
  },
  {
    rawId: "animesalt-mystream-multi",
    providerSlug: "animesalt",
    endpointSlug: "mystream-multi",
    providerName: "AnimeSalt (acdn)",
    displayName: "AnimeSalt MyStream",
    pattern: "https://animesalt.cx/episode/{slug}/?server=mystream",
    serverBadge: "Multi-Audio",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: true,
    isActive: true,
    sortOrder: 29,
  },
  {
    rawId: "vidzee-multi",
    providerSlug: "vidzee",
    endpointSlug: "multi",
    providerName: "VidZee (Captain America)",
    displayName: "Captain America",
    pattern: "https://player.vidzee.wtf/embed/tv/{tmdb_id}/1/{episode}?lang=en",
    serverBadge: "TMDB Multi",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: true,
    isActive: true,
    sortOrder: 30,
  },
  {
    rawId: "vidzee-sub",
    providerSlug: "vidzee",
    endpointSlug: "sub",
    providerName: "VidZee (Captain America)",
    displayName: "Captain America Sub",
    pattern: "https://player.vidzee.wtf/embed/tv/{tmdb_id}/1/{episode}?lang=en",
    serverBadge: "TMDB Embed",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 34,
  },
  {
    rawId: "vidzee-dub",
    providerSlug: "vidzee",
    endpointSlug: "dub",
    providerName: "VidZee (Captain America)",
    displayName: "Captain America Dub",
    pattern: "https://player.vidzee.wtf/embed/tv/{tmdb_id}/1/{episode}?lang=en",
    serverBadge: "TMDB Dub",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 35,
  },
  {
    rawId: "vidlove-multi",
    providerSlug: "vidlove",
    endpointSlug: "multi",
    providerName: "VidLove (Hawkeye)",
    displayName: "Hawkeye Multi",
    pattern: "https://player.vidlove.cc/embed/tv/{tmdb_id}/1/{episode}",
    serverBadge: "TMDB Multi",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: true,
    isActive: true,
    sortOrder: 37,
  },
  {
    rawId: "vidlove-sub",
    providerSlug: "vidlove",
    endpointSlug: "sub",
    providerName: "VidLove (Hawkeye)",
    displayName: "Hawkeye Sub",
    pattern: "https://player.vidlove.cc/embed/tv/{tmdb_id}/1/{episode}",
    serverBadge: "TMDB Embed",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 38,
  },
  {
    rawId: "1embed-multi",
    providerSlug: "1embed",
    endpointSlug: "multi",
    providerName: "1Embed (Spider-Man)",
    displayName: "Spider-Man Multi",
    pattern: "https://1embed.cc/embed/tv/{tmdb_id}/1/{episode}",
    serverBadge: "TMDB Multi",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: true,
    isActive: true,
    sortOrder: 39,
  },
  {
    rawId: "1embed-sub",
    providerSlug: "1embed",
    endpointSlug: "sub",
    providerName: "1Embed (Spider-Man)",
    displayName: "Spider-Man Sub",
    pattern: "https://1embed.cc/embed/tv/{tmdb_id}/1/{episode}",
    serverBadge: "TMDB Embed",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: false,
    sortOrder: 40,
  },
  {
    rawId: "cinemaos-multi",
    providerSlug: "cinemaos",
    endpointSlug: "multi",
    providerName: "CinemaOS (Scarlet Witch)",
    displayName: "Scarlet Witch Multi",
    pattern: "https://cinemaos.tech/player/{tmdb_id}/1/{episode}?lang=en",
    serverBadge: "TMDB Multi",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: true,
    isActive: true,
    sortOrder: 41,
  },
  {
    rawId: "cinemaos-sub",
    providerSlug: "cinemaos",
    endpointSlug: "sub",
    providerName: "CinemaOS (Scarlet Witch)",
    displayName: "Scarlet Witch Sub",
    pattern: "https://cinemaos.tech/player/{tmdb_id}/1/{episode}?lang=en",
    serverBadge: "TMDB Embed",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 45,
  },
  {
    rawId: "cinemaos-dub",
    providerSlug: "cinemaos",
    endpointSlug: "dub",
    providerName: "CinemaOS (Scarlet Witch)",
    displayName: "Scarlet Witch Dub",
    pattern: "https://cinemaos.tech/player/{tmdb_id}/1/{episode}?lang=en",
    serverBadge: "TMDB Dub",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 46,
  },
  {
    rawId: "2embed-sub",
    providerSlug: "2embed",
    endpointSlug: "sub",
    providerName: "2Embed",
    displayName: "2Embed Sub",
    pattern: "https://www.2embed.stream/embed/tv/{tmdb_id}/1/{episode}",
    serverBadge: "TMDB Embed",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 50,
  },
  {
    rawId: "2embed-dub",
    providerSlug: "2embed",
    endpointSlug: "dub",
    providerName: "2Embed",
    displayName: "2Embed Dub",
    pattern: "https://www.2embed.stream/embed/tv/{tmdb_id}/1/{episode}",
    serverBadge: "TMDB Embed",
    isDirectStream: false,
    isEmbedOnly: true,
    isMultiAudio: false,
    isActive: true,
    sortOrder: 55,
  },
];

function deriveRequiredId(pattern: string): string {
  if (/\{(?:tmdb_id|tmdb)\}/i.test(pattern)) return "tmdb";
  if (/\{(?:mal_id|mal)\}/i.test(pattern)) return "mal";
  if (/\{(?:anilist_id|anilist)\}/i.test(pattern)) return "anilist";
  if (/\{slug\}/i.test(pattern)) return "slug";
  return "none";
}

function deriveLanguage(row: RawProviderRow): string {
  if (row.isMultiAudio) return "multi";
  if (row.endpointSlug.includes("dub")) return "dub";
  return "sub";
}

function deriveAccessType(row: RawProviderRow): string {
  if (row.isEmbedOnly) return "embed";
  if (row.isDirectStream) return "direct";
  return "embed";
}

async function main() {
  const sql = postgres(url, { max: 1 });

  try {
    console.log("Seeding streaming providers and endpoints...");

    // Collect distinct parent providers
    const providersMap = new Map<string, { slug: string; name: string; priority: number }>();
    for (const row of RAW_ROWS) {
      if (!providersMap.has(row.providerSlug)) {
        providersMap.set(row.providerSlug, {
          slug: row.providerSlug,
          name: row.providerName,
          priority: row.sortOrder,
        });
      }
    }

    // Upsert providers into database
    const providerDbIds = new Map<string, string>();
    for (const p of providersMap.values()) {
      const [inserted] = await sql`
        INSERT INTO providers (slug, name, kind, active, priority, is_custom_adapter, updated_at)
        VALUES (${p.slug}, ${p.name}, 'STREAMING', true, ${p.priority}, false, NOW())
        ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name,
            kind = 'STREAMING',
            active = true,
            priority = EXCLUDED.priority,
            updated_at = NOW()
        RETURNING id
      `;
      providerDbIds.set(p.slug, inserted!.id as string);
    }

    console.log(`Upserted ${providersMap.size} providers into database.`);

    // Upsert endpoints into database
    let endpointsCount = 0;
    for (const row of RAW_ROWS) {
      const providerId = providerDbIds.get(row.providerSlug);
      if (!providerId) continue;

      const language = deriveLanguage(row);
      const accessType = deriveAccessType(row);
      const requiredIdType = deriveRequiredId(row.pattern);

      await sql`
        INSERT INTO provider_endpoints (
          provider_id, slug, display_name, language, access_type,
          badge, url_template, required_id_type, active, priority
        )
        VALUES (
          ${providerId}, ${row.endpointSlug}, ${row.displayName}, ${language}, ${accessType},
          ${row.serverBadge}, ${row.pattern}, ${requiredIdType}, ${row.isActive}, ${row.sortOrder}
        )
        ON CONFLICT (provider_id, slug) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            language = EXCLUDED.language,
            access_type = EXCLUDED.access_type,
            badge = EXCLUDED.badge,
            url_template = EXCLUDED.url_template,
            required_id_type = EXCLUDED.required_id_type,
            active = EXCLUDED.active,
            priority = EXCLUDED.priority
      `;
      endpointsCount++;
    }

    console.log(`Upserted ${endpointsCount} provider endpoints into database.`);
    console.log("Database streaming seeding complete!");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
