/**
 * Catalogue persistence (P1).
 *
 * AniList is a cache, not the database: every read path in this service is
 * meant to be answerable from Postgres. The repository owns the upsert,
 * including the fan-out rows (genres, relations, external ids, search index)
 * that must stay consistent with the main record.
 *
 * Upserts key on the provider id rather than the local uuid, because the
 * provider id is the only identifier guaranteed stable across re-syncs.
 */

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import {
  anime,
  animeExternalIds,
  animeGenres,
  animeRelations,
  animeSearchIndex,
  animeStudios,
  airingSchedule,
  episodes,
  episodeExternalIds,
} from "../../db/schema/index.js";
import { normalizeTitle } from "../../domain/media.js";
import type { DiscoveryCard } from "./discovery.js";
import type { AnimeDetail, AnimeSummary, ProviderEpisode } from "../../providers/metadata/types.js";

type AnimeRow = typeof anime.$inferSelect;

/**
 * Project one catalogue row onto the public card contract (P15).
 *
 * Lives here rather than inline so every row-reading surface produces the same
 * shape: `listCards` and `search` are both answerable from the catalogue, and a
 * client that has to accept two different row shapes is a client with two
 * schemas and one silent bug waiting to happen.
 */
function rowToCard(row: AnimeRow, genres: string[]): DiscoveryCard {
  return {
    id: row.id,
    anilistId: row.anilistId != null ? String(row.anilistId) : "",
    title: row.canonicalTitle,
    titles: {
      romaji: row.romajiTitle,
      english: row.englishTitle,
      native: row.nativeTitle,
      synonyms: row.synonyms ?? [],
    },
    coverUrl: row.coverUrl,
    coverImageLarge: row.coverImageLarge,
    bannerUrl: row.bannerUrl,
    format: row.format,
    status: row.status,
    season: row.season,
    seasonYear: row.seasonYear,
    year: row.year,
    averageScore: row.averageScore != null ? Number(row.averageScore) : null,
    totalEpisodes: row.totalEpisodes,
    popularity: row.popularity,
    genres,
    isAdult: row.isAdult,
  };
}

/** Genres for a set of titles, in one query. */
async function genresFor(db: Db, ids: string[]): Promise<Map<string, string[]>> {
  const byAnime = new Map<string, string[]>();
  if (ids.length === 0) return byAnime;

  const rows = await db
    .select({ animeId: animeGenres.animeId, genre: animeGenres.genre })
    .from(animeGenres)
    .where(inArray(animeGenres.animeId, ids));

  for (const row of rows) {
    const list = byAnime.get(row.animeId) ?? [];
    list.push(row.genre);
    byAnime.set(row.animeId, list);
  }
  return byAnime;
}

/**
 * Catalogue orderings a client may ask for (P17 browse).
 *
 * Named for what the catalogue can actually sort by, not for a provider's sort
 * vocabulary. "trending" is deliberately absent: trending is an upstream
 * signal with no column behind it, so it stays on the discovery route rather
 * than being quietly downgraded to popularity.
 */
export const ANIME_SORTS = [
  "popularity",
  "score",
  "recently-updated",
  "recently-added",
  "title",
  "newest",
] as const;

export type AnimeSort = (typeof ANIME_SORTS)[number];

export interface AnimeListOptions {
  limit: number;
  offset: number;
  season?: string;
  seasonYear?: number;
  status?: string;
  genre?: string;
  format?: string;
  sort?: AnimeSort;
}

/** Stable, URL-safe identifier derived from the canonical title. */
export function slugify(title: string, anilistId: string): string {
  const base = normalizeTitle(title).replace(/\s+/g, "-").slice(0, 120);
  // The id suffix guarantees uniqueness for titles that normalise identically.
  return `${base || "anime"}-${anilistId}`;
}

/**
 * Build the update half of the upsert, keeping stored values for anything the
 * provider omitted.
 *
 * `undefined` means "the provider did not tell us" and leaves the column alone;
 * `null` means "the provider says this is empty" and clears it. AniList genuinely
 * distinguishes the two: it omits `bannerImage` for entries without artwork while
 * sending an explicit null for an entry whose description is empty, so collapsing
 * both to null loses real information.
 *
 * `isAdult` is the exception that proves the rule: it is a non-null boolean and
 * `false` is a meaningful value, so it is only skipped when genuinely undefined.
 */
function merged(summary: AnimeSummary): Partial<typeof anime.$inferInsert> {
  // Each value below is passed through untouched. `keep` drops anything that is
  // `undefined` ("the provider said nothing") while letting an explicit `null`
  // through ("the provider says this field is empty"). Coercing with `?? null`
  // before the filter would erase that distinction and defeat the whole merge.
  return keep(
    {
      canonicalTitle: summary.canonicalTitle,
      synonyms: summary.titles.synonyms,
      status: summary.status,
      sourceUpdatedAt: summary.sourceUpdatedAt,
      updatedAt: new Date(),

      romajiTitle: summary.titles.romaji,
      englishTitle: summary.titles.english,
      nativeTitle: summary.titles.native,
      description: summary.description,
      coverUrl: summary.coverUrl,
      coverImageLarge: summary.coverImageLarge,
      bannerUrl: summary.bannerUrl,
      format: summary.format,
      year: summary.year,
      season: summary.season,
      seasonYear: summary.seasonYear,
      // `averageScore` is numeric in the domain but numeric(4,2) in Postgres, so
      // it crosses the seam as a string. Only stringify a real number.
      averageScore:
        typeof summary.averageScore === "number" ? String(summary.averageScore) : undefined,
      popularity: summary.popularity,
      favourites: summary.favourites,
      totalEpisodes: summary.totalEpisodes,
      durationMinutes: summary.durationMinutes,
      // `false` is meaningful here, so this is written whenever it is a boolean.
      isAdult: typeof summary.isAdult === "boolean" ? summary.isAdult : undefined,
    },
    [
      "canonicalTitle",
      "synonyms",
      "status",
      "sourceUpdatedAt",
      "updatedAt",
      "romajiTitle",
      "englishTitle",
      "nativeTitle",
      "description",
      "coverUrl",
      "coverImageLarge",
      "bannerUrl",
      "format",
      "year",
      "season",
      "seasonYear",
      "averageScore",
      "popularity",
      "favourites",
      "totalEpisodes",
      "durationMinutes",
      "isAdult",
    ],
  );
}

/** Drop every key whose value is `undefined`, leaving explicit nulls in place. */
function keep<T extends Record<string, unknown>>(values: T, keys: string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (values[key] !== undefined) out[key] = values[key];
  }
  return out as Partial<T>;
}

/**
 * De-duplicate a tag list case-insensitively, keeping the first spelling seen.
 *
 * The `anime_genres` primary key is (animeId, genre), which is case-sensitive, so
 * a payload containing both "Action" and "action" would otherwise insert two rows
 * for one tag. Collapsing them here keeps the identity a reader expects without
 * inventing a global genre taxonomy, which is a larger product decision than P1
 * should make.
 */
export function dedupePreservingSpelling(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(trimmed);
  }

  return out;
}


/** Column values for a new episode row, from a provider's episode. */
function episodeValues(episode: ProviderEpisode) {
  return {
    episodeNumber: episode.episodeNumber,
    absoluteNumber: episode.absoluteNumber ?? null,
    title: episode.title ?? null,
    description: episode.description ?? null,
    durationSeconds: episode.durationSeconds ?? null,
    thumbnailUrl: episode.thumbnailUrl ?? null,
    airDate: episode.airDate ? new Date(episode.airDate * 1000) : null,
    isFiller: episode.isFiller,
  };
}

/**
 * The update half of an episode upsert: only the fields the provider supplied.
 *
 * P1's contract, applied to episodes. `undefined` means "the provider said
 * nothing" and is left out entirely, so the stored value survives. `null` means
 * "the provider says this is empty" and is written, clearing a stale value.
 *
 * `isFiller` is included whenever it is a boolean because `false` is a real
 * answer; omitting it would make a filler episode impossible to un-mark.
 */
function episodePatch(episode: ProviderEpisode): Partial<typeof episodes.$inferInsert> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (episode.title !== undefined) patch.title = episode.title;
  if (episode.description !== undefined) patch.description = episode.description;
  if (episode.durationSeconds !== undefined) patch.durationSeconds = episode.durationSeconds;
  if (episode.thumbnailUrl !== undefined) patch.thumbnailUrl = episode.thumbnailUrl;
  if (episode.absoluteNumber !== undefined) patch.absoluteNumber = episode.absoluteNumber;
  if (episode.airDate !== undefined) {
    patch.airDate = episode.airDate ? new Date(episode.airDate * 1000) : null;
  }
  if (typeof episode.isFiller === "boolean") patch.isFiller = episode.isFiller;

  return patch as Partial<typeof episodes.$inferInsert>;
}

export class AnimeRepository {
  constructor(private readonly db: Db) {}

  /**
   * Insert or update one record and everything hanging off it.
   *
   * Merge semantics: a field the provider omitted keeps its stored value, and is
   * only overwritten when the provider actually sends a value.
   *
   * The naive alternative -- assigning every canonical field from the incoming
   * summary -- silently destroys the catalogue whenever a response is partial.
   * That is not hypothetical: AniList omits `description`, `bannerImage` and
   * `episodes` depending on the entry, and a degraded or schema-drifted response
   * omits far more. Because `search` and `discovery` upsert every provider result
   * they return, a single thin response would blank out descriptions, artwork and
   * episode counts across the whole catalogue, and a later reader could never
   * tell the difference from a genuinely empty catalogue.
   *
   * "Omitted" and "explicitly cleared" are therefore distinguished by `null` vs
   * `undefined`. The adapter maps an absent field to `undefined`; only a provider
   * that deliberately reports an empty value sends `null`.
   */
  async upsert(summary: AnimeSummary): Promise<string> {
    const anilistId = Number(summary.anilistId);

    const [row] = await this.db
      .insert(anime)
      .values({
        slug: slugify(summary.canonicalTitle, summary.anilistId),
        anilistId: Number.isFinite(anilistId) ? anilistId : null,
        canonicalTitle: summary.canonicalTitle,
        synonyms: summary.titles.synonyms,
        romajiTitle: summary.titles.romaji,
        englishTitle: summary.titles.english,
        nativeTitle: summary.titles.native,
        description: summary.description,
        coverUrl: summary.coverUrl,
        coverImageLarge: summary.coverImageLarge,
        bannerUrl: summary.bannerUrl,
        type: "ANIME",
        format: summary.format,
        status: summary.status,
        isAdult: summary.isAdult,
        year: summary.year,
        season: summary.season,
        seasonYear: summary.seasonYear,
        averageScore: summary.averageScore != null ? String(summary.averageScore) : null,
        popularity: summary.popularity,
        favourites: summary.favourites,
        totalEpisodes: summary.totalEpisodes,
        durationMinutes: summary.durationMinutes,
        sourceUpdatedAt: summary.sourceUpdatedAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        // `anilist_id` carries a unique constraint, which is what makes this
        // an idempotent upsert rather than an accumulating one.
        target: anime.anilistId,
        set: merged(summary),
      })
      .returning({ id: anime.id });

    const localId = row.id;
    if (!localId) {
      throw new Error(`upsert returned no row for anilist ${summary.anilistId}`);
    }

    await Promise.all([
      this.#replaceGenres(localId, summary.genres),
      this.#replaceStudios(localId, summary.studios),
      this.#replaceExternalIds(localId, summary.externalIds),
      this.#upsertSearchIndex(localId, summary),
    ]);

    return localId;
  }

  /**
   * Genres are replaced rather than appended.
   *
   * Appending would let genre filters drift as upstream renames a tag, and
   * there is no history worth keeping for a set this small.
   *
   * `undefined` (the provider did not report genres) keeps whatever is stored;
   * `[]` is a genuine "no genres" and clears them. Deleting on `undefined` would
   * mean one partial response silently un-tags every title it touches.
   */
  async #replaceGenres(animeId: string, genres: string[] | undefined): Promise<void> {
    if (genres === undefined) return;

    await this.db.delete(animeGenres).where(eq(animeGenres.animeId, animeId));
    if (genres.length === 0) return;

    // De-duplicated case-insensitively but stored in the provider's spelling, so
    // "Action" and "action" from one payload cannot become two rows. Cross-title
    // canonicalisation is a separate concern and is not applied here.
    const unique = dedupePreservingSpelling(genres);

    await this.db
      .insert(animeGenres)
      .values(unique.map((genre) => ({ animeId, genre })))
      .onConflictDoNothing();
  }

  /** Studios follow the same omitted-versus-empty rule as genres. */
  async #replaceStudios(animeId: string, studios: string[] | undefined): Promise<void> {
    if (studios === undefined) return;

    await this.db.delete(animeStudios).where(eq(animeStudios.animeId, animeId));
    if (studios.length === 0) return;

    await this.db
      .insert(animeStudios)
      .values(studios.map((name) => ({ animeId, studioName: name, isMain: false })))
      .onConflictDoNothing();
  }

  async #replaceExternalIds(
    animeId: string,
    externalIds: Record<string, string | undefined>,
  ): Promise<void> {
    const entries = Object.entries(externalIds).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
    );
    if (entries.length === 0) return;

    await this.db
      .insert(animeExternalIds)
      .values(entries.map(([idType, externalId]) => ({ animeId, idType, externalId })))
      .onConflictDoUpdate({
        target: [animeExternalIds.animeId, animeExternalIds.idType],
        set: { externalId: sql`excluded.external_id` },
      });
  }

  /**
   * Maintain a normalised token blob for search.
   *
   * Every known spelling is folded into one row, so a search for "Kimi no Na wa"
   * still matches a record whose canonical title is "Your Name".
   */
  async #upsertSearchIndex(animeId: string, summary: AnimeSummary): Promise<void> {
    const candidates = [
      summary.canonicalTitle,
      summary.titles.romaji,
      summary.titles.english,
      summary.titles.native,
      ...summary.titles.synonyms,
    ].filter((value): value is string => typeof value === "string" && value.trim() !== "");

    const tokens = candidates
      .map(normalizeTitle)
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index);

    if (tokens.length === 0) return;

    await this.db
      .insert(animeSearchIndex)
      .values({
        animeId,
        normalized: tokens.join(" "),
        // The canonical title is always first in the candidate list.
        isPrimary: tokens[0] === normalizeTitle(summary.canonicalTitle),
      })
      .onConflictDoUpdate({
        target: animeSearchIndex.animeId,
        set: { normalized: tokens.join(" ") },
      });
  }

/** Full detail plus relations and external ids, for `GET /anime/:id`. */
  async getByAnilistId(anilistId: string): Promise<Record<string, any> | null> {
    const numericId = Number(anilistId);
    let record: any = null;

    if (Number.isFinite(numericId)) {
      const [found] = await this.db
        .select()
        .from(anime)
        .where(eq(anime.anilistId, numericId))
        .limit(1);
      record = found;
    }

    if (!record) {
      try {
        const [found] = await this.db
          .select()
          .from(anime)
          .where(eq(anime.id, anilistId))
          .limit(1);
        record = found;
      } catch {
        record = null;
      }
    }

    if (!record) return null;

    const [genres, studios, relations, externalIds] = await Promise.all([
      this.db
        .select({ genre: animeGenres.genre })
        .from(animeGenres)
        .where(eq(animeGenres.animeId, record.id)),
      this.db
        .select({ studioName: animeStudios.studioName })
        .from(animeStudios)
        .where(eq(animeStudios.animeId, record.id)),
      this.db.select().from(animeRelations).where(eq(animeRelations.animeId, record.id)),
      this.db
        .select({ idType: animeExternalIds.idType, externalId: animeExternalIds.externalId })
        .from(animeExternalIds)
        .where(eq(animeExternalIds.animeId, record.id)),
    ]);

    return {
      ...record,
      genres: genres.map((row) => row.genre),
      studios: studios.map((row) => row.studioName),
      relations,
      externalIds: Object.fromEntries(externalIds.map((row) => [row.idType, row.externalId])),
    };
  }

  /**
   * The provider's stated episode total, or null.
   *
   * Deliberately not derived from the number of episode rows. A show airing now
   * has a stated total of 24 and may have 7 rows; reporting 7 as "total
   * episodes" tells a reader the show is finished.
   */
  async getTotalEpisodes(anilistId: string): Promise<number | null> {
    const numericId = Number(anilistId);
    if (Number.isFinite(numericId)) {
      const [row] = await this.db
        .select({ totalEpisodes: anime.totalEpisodes })
        .from(anime)
        .where(eq(anime.anilistId, numericId))
        .limit(1);

      if (row?.totalEpisodes !== undefined) return row.totalEpisodes;
    }

    try {
      const [row] = await this.db
        .select({ totalEpisodes: anime.totalEpisodes })
        .from(anime)
        .where(eq(anime.id, anilistId))
        .limit(1);

      return row?.totalEpisodes ?? null;
    } catch {
      return null;
    }
  }

  async getLocalIdByAnilistId(anilistId: string): Promise<string | null> {
    const numericId = Number(anilistId);
    if (Number.isFinite(numericId)) {
      const [record] = await this.db
        .select({ id: anime.id })
        .from(anime)
        .where(eq(anime.anilistId, numericId))
        .limit(1);

      if (record?.id) return record.id;
    }

    try {
      const [record] = await this.db
        .select({ id: anime.id })
        .from(anime)
        .where(eq(anime.id, anilistId))
        .limit(1);

      return record?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Paginated catalogue listing.
   *
   * Reads the database rather than AniList: this endpoint is the one most likely
   * to be hit by every home-page row at once, and proxying it would spend the
   * upstream rate limit on data we already hold.
   */
  async list(options: AnimeListOptions): Promise<{ items: DiscoveryCard[]; total: number }> {
    const conditions = [];

    if (options.season && options.seasonYear) {
      conditions.push(
        and(eq(anime.season, options.season), eq(anime.seasonYear, options.seasonYear)),
      );
    }
    if (options.status) conditions.push(eq(anime.status, options.status));
    if (options.format) conditions.push(eq(anime.format, options.format));

    const base = conditions.length > 0 ? and(...conditions) : undefined;

    // Popularity correlates most reliably with "what people are actually
    // watching", so it drives the default order; score breaks ties.
    const order: Record<AnimeSort, ReturnType<typeof desc>[]> = {
      popularity: [desc(anime.popularity), desc(anime.averageScore)],
      score: [desc(anime.averageScore), desc(anime.popularity)],
      // `source_updated_at` is the provider's own updatedAt, so this is "what
      // changed upstream", not "what a background job last touched".
      "recently-updated": [desc(anime.sourceUpdatedAt), desc(anime.popularity)],
      "recently-added": [desc(anime.createdAt), desc(anime.popularity)],
      title: [asc(anime.canonicalTitle)],
      newest: [desc(anime.year), desc(anime.seasonYear), desc(anime.popularity)],
    };
    const orderBy = order[options.sort ?? "popularity"];

    // A genre filter has to be applied inside the query, not on the returned
    // page: filtering 20 of 50 rows down to 3 would leave most pages empty.
    //
    // Matched case-insensitively. `anime_genres.genre` stores the provider's
    // spelling ("Action"), so an exact match would silently return nothing for
    // "action" — a filter that appears broken rather than one that is forgiving.
    const rows = options.genre
      ? await this.db
          .select({ record: anime })
          .from(anime)
          .innerJoin(animeGenres, eq(animeGenres.animeId, anime.id))
          .where(and(base, sql`lower(${animeGenres.genre}) = lower(${options.genre})`))
          .orderBy(...orderBy)
          .limit(options.limit)
          .offset(options.offset)
      : await this.db
          .select()
          .from(anime)
          .where(base)
          .orderBy(...orderBy)
          .limit(options.limit)
          .offset(options.offset);

    const [{ count }] = options.genre
      ? await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(anime)
          .innerJoin(animeGenres, eq(animeGenres.animeId, anime.id))
          .where(and(base, sql`lower(${animeGenres.genre}) = lower(${options.genre})`))
      : await this.db.select({ count: sql<number>`count(*)::int` }).from(anime).where(base);

    // Cards, not rows (P17): the catalogue list, home shelves and search all
    // answer with the same shape, so a client has one model rather than three.
    const genresByAnime = await genresFor(
      this.db,
      rows.map((row: any) => (row.record ? row.record.id : row.id)),
    );

    return {
      items: rows.map((row: any) => {
        const record = row.record ?? row;
        return rowToCard(record, genresByAnime.get(record.id) ?? []);
      }),
      total: Number(count ?? 0),
    };
  }

  /** Title search across the normalised index. */
  /**
   * Title search over the catalogue, as canonical cards (P15).
   *
   * Cards rather than raw rows: the provider-fallback branch of
   * `AnimeService.search` returns cards too, so the endpoint answers with one
   * shape regardless of whether the answer came from Postgres or upstream.
   */
  async search(query: string, limit: number): Promise<DiscoveryCard[]> {
    const normalized = normalizeTitle(query);
    if (!normalized) return [];

    const rows = await this.db
      .select({ record: anime })
      .from(anime)
      .innerJoin(animeSearchIndex, eq(animeSearchIndex.animeId, anime.id))
      .where(
        or(
          ilike(animeSearchIndex.normalized, `%${normalized}%`),
          // Raw predicate kept as a fallback for exact substrings the
          // normaliser would mangle (punctuation-heavy titles).
          ilike(anime.canonicalTitle, `%${query}%`),
        ),
      )
      .orderBy(desc(anime.popularity))
      .limit(limit);

    const genresByAnime = await genresFor(
      this.db,
      rows.map((row) => row.record.id),
    );
    return rows.map((row) =>
      rowToCard(row.record, genresByAnime.get(row.record.id) ?? []),
    );
  }

/** Persist relation edges, replacing whatever was there before. */
  async replaceRelations(animeId: string, detail: AnimeDetail): Promise<void> {
    await this.db.delete(animeRelations).where(eq(animeRelations.animeId, animeId));
    if (detail.relations.length === 0) return;

    await this.db
      .insert(animeRelations)
      .values(
        detail.relations.map((relation) => ({
          animeId,
          relationType: relation.type,
          relatedAnimeId: relation.anilistId,
          relatedTitle: relation.title ?? null,
          coverUrl: relation.coverUrl ?? null,
        })),
      )
      .onConflictDoNothing();
  }

  /**
   * Upsert the episode catalog (P4).
   *
   * Conflicts update only the fields a provider can genuinely improve, leaving
   * values we derived ourselves untouched, and never renumber an episode.
   */
  async upsertEpisodes(animeId: string, incoming: ProviderEpisode[]): Promise<number> {
    if (incoming.length === 0) return 0;

    // Two steps rather than one ON CONFLICT DO UPDATE, because the merge has to
    // happen before the SQL is built.
    //
    // Assigning `excluded.title` means a provider that omits a field sends NULL
    // and erases what we already had: a sparse re-sync would blank out every
    // title, description and duration in the catalogue. That is the same defect
    // P1 fixed for the anime row, reintroduced one level down.
    //
    // A SQL COALESCE would stop the erasing, but it cannot express the other
    // half of the contract: `coalesce` treats an explicit null and an omitted
    // field identically, so a provider that genuinely reports "this episode has
    // no description" could never clear a stale one. Once the value is a column,
    // "absent" and "null" are the same thing, so the decision has to be made
    // here, in JS, where the difference is still visible.
    const inserted = await this.db
      .insert(episodes)
      .values(incoming.map((episode) => ({ animeId, ...episodeValues(episode) })))
      .onConflictDoNothing()
      .returning({ id: episodes.id, episodeNumber: episodes.episodeNumber });

    const insertedNumbers = new Set(inserted.map((row) => row.episodeNumber));
    const existing = incoming.filter((episode) => !insertedNumbers.has(episode.episodeNumber));

    // Only the episodes that already existed need a merge pass. On a first sync
    // this is empty, so the common case stays a single insert. A re-sync pays
    // one update per episode, which is acceptable here because this is a write
    // path driven by sync, not a read path on a request.
    for (const episode of existing) {
      const patch = episodePatch(episode);
      if (Object.keys(patch).length === 0) continue;

      await this.db
        .update(episodes)
        .set(patch)
        .where(and(eq(episodes.animeId, animeId), eq(episodes.episodeNumber, episode.episodeNumber)));
    }

    const byNumber = new Map(inserted.map((row) => [row.episodeNumber, row.id]));
    for (const episode of existing) {
      const [row] = await this.db
        .select({ id: episodes.id })
        .from(episodes)
        .where(and(eq(episodes.animeId, animeId), eq(episodes.episodeNumber, episode.episodeNumber)))
        .limit(1);
      if (row) byNumber.set(episode.episodeNumber, row.id);
    }

    // Link provider-native episode ids so playback skips a re-lookup per play.
    const withExternal = incoming.filter((episode) => episode.externalId);
    if (withExternal.length > 0) {
      const byNumber = new Map(inserted.map((row) => [row.episodeNumber, row.id]));

      await this.db
        .insert(episodeExternalIds)
        .values(
          withExternal
            .map((episode) => ({
              episodeId: byNumber.get(episode.episodeNumber)!,
              providerSlug: "anilist",
              externalId: episode.externalId!,
              providerEpisodeNumber: episode.episodeNumber,
            }))
            .filter((row) => Boolean(row.episodeId)),
        )
        .onConflictDoNothing();
    }

    return inserted.length;
  }

  /** Episodes for one title, oldest first. */
  /**
   * Canonical episodes for one title, joined with their airing slot.
   *
   * A left join, not an inner one: an episode with no slot is a real and common
   * state (a show that has not started, or one whose provider gave no schedule),
   * and an inner join would silently hide those episodes from the catalogue.
   *
   * Ordered by `episode_number` on an integer column, so 1, 2, 10 -- never
   * 1, 10, 2.
   */
  async listEpisodesWithAiring(animeId: string): Promise<Record<string, any>[]> {
    return this.db
      .select({
        id: episodes.id,
        episodeNumber: episodes.episodeNumber,
        absoluteNumber: episodes.absoluteNumber,
        title: episodes.title,
        description: episodes.description,
        durationSeconds: episodes.durationSeconds,
        thumbnailUrl: episodes.thumbnailUrl,
        isFiller: episodes.isFiller,
        airingAt: airingSchedule.airingAt,
        slotStatus: airingSchedule.status,
        slotSource: airingSchedule.source,
      })
      .from(episodes)
      .leftJoin(
        airingSchedule,
        and(
          eq(airingSchedule.animeId, episodes.animeId),
          eq(airingSchedule.episodeNumber, episodes.episodeNumber),
        ),
      )
      .where(eq(episodes.animeId, animeId))
      .orderBy(episodes.episodeNumber);
  }

  /** One episode by number within a title. */
  async getEpisodeByNumber(animeId: string, episodeNumber: number): Promise<Record<string, any> | null> {
    const [row] = await this.db
      .select()
      .from(episodes)
      .where(and(eq(episodes.animeId, animeId), eq(episodes.episodeNumber, episodeNumber)))
      .limit(1);
    return row ?? null;
  }

  async listEpisodes(animeId: string): Promise<Record<string, any>[]> {
    return this.db
      .select()
      .from(episodes)
      .where(eq(episodes.animeId, animeId))
      .orderBy(episodes.episodeNumber);
  }

  /** One episode row by local id, used by the playback resolver. */
  async getEpisode(episodeId: string): Promise<Record<string, any> | null> {
    const [record] = await this.db
      .select()
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .limit(1);
    return record ?? null;
  }

  /**
   * Parent titles by local uuid, with genres and external ids attached.
   *
   * The playback route holds a local uuid (the episode's `animeId`) but the
   * resolver needs provider ids. Fetching the parent with its cross-references in
   * one query avoids a second round trip on the play path.
   */
  async listParentTitles(animeIds: string[]): Promise<Record<string, any>[]> {
    if (animeIds.length === 0) return [];

    const records = await this.db.select().from(anime).where(inArray(anime.id, animeIds));
    if (records.length === 0) return [];

    const ids = records.map((record) => record.id);
    const [genres, externalIds] = await Promise.all([
      this.db.select().from(animeGenres).where(inArray(animeGenres.animeId, ids)),
      this.db.select().from(animeExternalIds).where(inArray(animeExternalIds.animeId, ids)),
    ]);

    const genresByAnime = new Map<string, string[]>();
    for (const row of genres) {
      const list = genresByAnime.get(row.animeId);
      if (list) list.push(row.genre);
      else genresByAnime.set(row.animeId, [row.genre]);
    }

    const idsByAnime = new Map<string, Record<string, string>>();
    for (const row of externalIds) {
      const map = idsByAnime.get(row.animeId);
      if (map) map[row.idType] = row.externalId;
      else idsByAnime.set(row.animeId, { [row.idType]: row.externalId });
    }

    return records.map((record) => ({
      ...record,
      genres: genresByAnime.get(record.id) ?? [],
      externalIds: idsByAnime.get(record.id) ?? {},
    }));
  }

  /** Provider-native episode ids already known for an episode. */
  async getEpisodeExternalIds(
    episodeId: string,
  ): Promise<Array<{ providerSlug: string; externalId: string }>> {
    return this.db
      .select({
        providerSlug: episodeExternalIds.providerSlug,
        externalId: episodeExternalIds.externalId,
      })
      .from(episodeExternalIds)
      .where(eq(episodeExternalIds.episodeId, episodeId));
  }

  /** Titles the sync jobs should refresh: never-synced ones plus stale ones. */
  async listForSync(
    limit: number,
    staleAfterSeconds: number,
  ): Promise<Array<{ id: string; anilistId: string }>> {
    const cutoff = Math.floor(Date.now() / 1000) - staleAfterSeconds;

    const rows = await this.db
      .select({ id: anime.id, anilistId: anime.anilistId })
      .from(anime)
      .where(or(sql`${anime.sourceUpdatedAt} is null`, sql`${anime.sourceUpdatedAt} < ${cutoff}`))
      .orderBy(anime.sourceUpdatedAt)
      .limit(limit);

    // AniList ids are nullable, and a row without one cannot be re-fetched.
    return rows
      .filter((row) => row.anilistId != null)
      .map((row) => ({ id: row.id, anilistId: String(row.anilistId) }));
  }

  /** Row count, used by the health check. */
  async count(): Promise<number> {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(anime);
    return Number(count ?? 0);
  }

  /**
   * Discovery cards straight from the catalogue, with genres resolved in the same
   * round trip rather than one query per row.
   *
   * This is the canonical half of discovery: it never calls a provider, so
   * "recently added" and "recently updated" keep working when AniList is down.
   */
  async listCards(options: {
    limit: number;
    offset: number;
    order: "recent" | "updated";
  }): Promise<{ items: DiscoveryCard[]; total: number }> {
    // `source_updated_at` is AniList's own `updatedAt`, not our sync timestamp.
    // Sorting on `updated_at` here would surface whatever a background job last
    // touched rather than what actually changed upstream, so `recent` uses
    // `created_at` and `updated` uses `source_updated_at`.
    const orderColumn = options.order === "recent" ? desc(anime.createdAt) : desc(anime.sourceUpdatedAt);

    const rows = await this.db.select().from(anime).orderBy(orderColumn).limit(options.limit).offset(options.offset);

    // Rows with no upstream marker sort last rather than pretending to be 1970.
    const [total] = await this.db.select({ count: sql<number>`count(*)::int` }).from(anime);

    if (rows.length === 0) return { items: [], total: Number(total?.count ?? 0) };

    const genresByAnime = await genresFor(
      this.db,
      rows.map((row) => row.id),
    );

    return {
      items: rows.map((row) => rowToCard(row, genresByAnime.get(row.id) ?? [])),
      total: Number(total?.count ?? 0),
    };
  }

  async listGenres(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ genre: animeGenres.genre })
      .from(animeGenres)
      .orderBy(animeGenres.genre);
    return rows.map((row) => row.genre);
  }
}