import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { requestPublicRows } from "./public-data-request.mjs";
import { createPublicProfileLink, isValidProfileSlug } from "./public-work-mapping.mjs";

export const PUBLIC_ARTIST_SEARCH_LIMIT = 20;
export const PUBLIC_ARTIST_SEARCH_CANDIDATE_LIMIT = 50;

export function normalizeArtistSearchQuery(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 100);
}

function escapeLikePattern(value) {
  return value.replace(/[\\%_*]/g, "\\$&");
}

function compareText(first, second) {
  return first.localeCompare(second, "en", { sensitivity: "base" }) || first.localeCompare(second, "en");
}

export function rankPublishedArtists(rows, query) {
  const normalized = normalizeArtistSearchQuery(query).toLocaleLowerCase("en");
  if (normalized.length < 2) return [];

  const matches = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const displayName = typeof row?.display_name === "string" ? row.display_name.trim() : "";
    const slug = typeof row?.slug === "string" ? row.slug.trim() : "";
    const href = createPublicProfileLink(slug);
    if (!displayName || !href) continue;
    matches.set(slug, Object.freeze({ displayName, slug, href }));
  }

  return [...matches.values()]
    .map((profile) => {
      const name = profile.displayName.toLocaleLowerCase("en");
      const slug = profile.slug.toLocaleLowerCase("en");
      const rank = name === normalized || slug === normalized
        ? 0
        : name.startsWith(normalized) || slug.startsWith(normalized)
          ? 1
          : 2;
      return { profile, rank };
    })
    .sort((first, second) => first.rank - second.rank ||
      compareText(first.profile.displayName, second.profile.displayName) ||
      compareText(first.profile.slug, second.profile.slug))
    .slice(0, PUBLIC_ARTIST_SEARCH_LIMIT)
    .map(({ profile }) => profile);
}

export function createPublicArtistSearchRepository(config, request = requestPublicRows) {
  return Object.freeze({
    async search(query) {
      const normalized = normalizeArtistSearchQuery(query);
      if (normalized.length < 2) return [];
      const pattern = `*${escapeLikePattern(normalized)}*`;
      const base = {
        select: "slug,display_name",
        profile_type: "eq.artist",
        claim_state: "eq.claimed",
        publication_status: "eq.published",
        order: "display_name.asc,slug.asc",
        limit: String(PUBLIC_ARTIST_SEARCH_CANDIDATE_LIMIT)
      };
      const [nameMatches, slugMatches] = await Promise.all([
        request(config, "public_profiles", new URLSearchParams({ ...base, display_name: `ilike.${pattern}` })),
        request(config, "public_profiles", new URLSearchParams({ ...base, slug: `ilike.${pattern}` }))
      ]);
      return rankPublishedArtists([...nameMatches, ...slugMatches], normalized);
    }
  });
}

export async function getPublicArtistSearchRepository() {
  const runtime = await getFrontendRuntime();
  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return Object.freeze({ runtime, repository: null });
  }
  return Object.freeze({
    runtime,
    repository: createPublicArtistSearchRepository(runtime.config)
  });
}
