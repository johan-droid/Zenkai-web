/**
 * Canonical episode to provider identity (P5).
 *
 * A canonical episode is `(anime_id, episode_number)`. A streaming provider
 * needs something else entirely: an AniList id, a MAL id, a provider-native
 * episode slug. Those are different id spaces and conflating them is how a
 * resolver ends up sending `null`, `undefined` or a canonical uuid to an adapter
 * and calling the result "no streams".
 *
 * This module is the only place that translation happens. Everything downstream
 * -- eligibility, adapters, the HTTP layer -- works in provider vocabulary, and
 * everything upstream works in canonical vocabulary.
 */

import type { AnimeRepository } from "../anime/repository.js";
import type { AudioTrack, StreamingProvider } from "../../providers/streaming/types.js";

/**
 * External ids for one title, keyed by provider name.
 *
 * Absence is the normal case, not an error: most titles are catalogued from one
 * provider, and the ones they are missing is exactly what decides which
 * providers are applicable.
 */
export type AnimeIdentity = Record<string, string | undefined>;

/** Provider-native episode ids, keyed by provider slug. */
export type EpisodeIdentity = Record<string, string>;

/**
 * What identity a provider needs before it can be asked for sources.
 *
 * Derived from the endpoint configuration rather than hard-coded here, so
 * adding a provider that needs a different id space is a registry change and
 * not a resolver change.
 */
export function requiredIdTypeOf(provider: StreamingProvider): string | null {
  if (provider.capabilities.requiresMalId) return "mal";
  return null;
}

/**
 * Why a provider was not asked.
 *
 * Deliberately more than "failed". A provider that was never applicable because
 * we lack an id it needs is a different fact from one that was asked and
 * returned nothing, and collapsing them makes a resolution report claim that a
 * provider had nothing to offer when in fact it was never in a position to say.
 */
export type SkipReason =
  | "missing_required_id"
  | "inactive"
  | "quarantined"
  | "unsupported_language"
  | "unsupported_access";

export interface ProviderIdentityResolution {
  anime: AnimeIdentity;
  episode: EpisodeIdentity;
  /** Provider slugs that cannot be asked, and why. */
  skipped: Array<{ providerSlug: string; reason: SkipReason; detail?: string }>;
  /**
   * Providers that are applicable. Everything here can be asked safely; nothing
   * in this list will be sent a missing or fabricated id.
   */
  eligible: string[];
}

/**
 * Load every external id we hold for a canonical episode's title.
 *
 * A missing id is never a failure. It is the signal that decides which providers
 * are applicable, so the caller skips those and asks the rest.
 */
export async function resolveEpisodeIdentity(
  repo: AnimeRepository,
  episodeId: string,
): Promise<{
  animeId: string;
  episodeNumber: number;
  anilistId: string | null;
  identity: ProviderIdentityResolution;
} | null> {
  const episode = await repo.getEpisode(episodeId);
  if (!episode) return null;

  const animeId = String((episode as { animeId: string }).animeId);
  const episodeNumber = Number((episode as { episodeNumber: number }).episodeNumber);

  const [title] = await repo.listParentTitles([animeId]);
  if (!title) return null;

  // Every id we hold for the title, not just AniList and MAL. A provider keyed
  // on TMDB or Kitsu works here without the resolver learning about it.
  const external: Record<string, string> = { ...(title.externalIds ?? {}) };
  const anilistId = external.anilist ?? (title.anilistId != null ? String(title.anilistId) : null);
  if (anilistId) external.anilist = anilistId;

  // Provider-native episode ids, for providers that index episodes rather than
  // deriving them from (title, number).
  const episodeExternal = await repo.getEpisodeExternalIds(episodeId);
  const episodeIds: EpisodeIdentity = {};
  for (const row of episodeExternal) episodeIds[row.providerSlug] = row.externalId;

  return {
    animeId,
    episodeNumber,
    anilistId,
    identity: { anime: external, episode: episodeIds, skipped: [], eligible: [] },
  };
}

/**
 * Split providers into those we can ask and those we cannot.
 *
 * Skipping happens here, before any call, so a provider that cannot possibly
 * answer never sits on the critical path of a play request. The alternative --
 * asking it and treating the empty answer as "no streams" -- is a lie about a
 * provider that was never in a position to respond.
 */
export function partitionProviders(
  providers: StreamingProvider[],
  identity: { anime: AnimeIdentity; episode: EpisodeIdentity },
  options: {
    language: AudioTrack;
    quarantined: (slug: string) => boolean;
  },
): { eligible: StreamingProvider[]; skipped: Array<{ providerSlug: string; reason: SkipReason; detail?: string }> } {
  const eligible: StreamingProvider[] = [];
  const skipped: Array<{ providerSlug: string; reason: SkipReason; detail?: string }> = [];

  for (const provider of providers) {
    if (!provider.enabled) {
      skipped.push({ providerSlug: provider.slug, reason: "inactive" });
      continue;
    }

    if (options.quarantined(provider.slug)) {
      skipped.push({ providerSlug: provider.slug, reason: "quarantined" });
      continue;
    }

    if (!provider.capabilities.languages.includes(options.language)) {
      skipped.push({ providerSlug: provider.slug, reason: "unsupported_language" });
      continue;
    }

    const required = requiredIdTypeOf(provider);
    if (required && !identity.anime[required]) {
      // Not applicable, not broken. We simply do not hold the id it needs.
      skipped.push({
        providerSlug: provider.slug,
        reason: "missing_required_id",
        detail: `needs ${required}`,
      });
      continue;
    }

    eligible.push(provider);
  }

  return { eligible, skipped };
}
