import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import {
  createPublicImageUrl,
  requestPublicRows
} from "./public-data-request.mjs";
import { spreadDiscoverWorks } from "./discover-ordering.mjs";
import { canonicalizeFormatDisciplines } from "./work-format-disciplines.mjs";
import {
  DISCOVER_PROFILE_SELECT,
  DISCOVER_WORK_SELECT,
  mapDiscoverResult,
  PUBLIC_COVER_SELECT,
} from "./public-work-mapping.mjs";

export const DISCOVER_CANDIDATE_LIMIT = 120;
export const DISCOVER_INITIAL_BATCH = 12;

function inFilter(ids) {
  return `in.(${ids.join(",")})`;
}

export function createDiscoverRepository(
  client,
  config,
  request = requestPublicRows,
  candidateLimit = DISCOVER_CANDIDATE_LIMIT
) {
  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,
    candidateLimit,

    async listWorks({ formatDisciplines = [] } = {}) {
      const selectedFormats = canonicalizeFormatDisciplines(formatDisciplines);
      const workQuery = new URLSearchParams({
        select: DISCOVER_WORK_SELECT,
        visibility: "eq.published",
        published_at: "not.is.null",
        order: "published_at.desc,id.asc",
        limit: String(candidateLimit)
      });
      if (selectedFormats.length) {
        workQuery.set("format_discipline", inFilter(selectedFormats));
      }
      const works = await request(config, "works", workQuery);
      if (!works.length) return [];

      const ownerIds = [...new Set(works.map((work) => work.owner_profile_id))];
      const profileQuery = new URLSearchParams({
        select: DISCOVER_PROFILE_SELECT,
        id: inFilter(ownerIds),
        profile_type: "eq.artist",
        publication_status: "eq.published",
        order: "id.asc"
      });
      const imageQuery = new URLSearchParams({
        select: PUBLIC_COVER_SELECT,
        work_id: inFilter(works.map((work) => work.id)),
        is_cover: "eq.true",
        public_object_path: "not.is.null",
        order: "work_id.asc,id.asc"
      });
      const [profiles, images] = await Promise.all([
        request(config, "public_profiles", profileQuery),
        request(config, "work_images", imageQuery)
      ]);
      const mapped = mapDiscoverResult(
        works,
        profiles,
        images,
        (path) => createPublicImageUrl(client, path)
      );

      return spreadDiscoverWorks(mapped);
    }
  });
}

export async function getDiscoverRepository() {
  const runtime = await getFrontendRuntime();
  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return Object.freeze({ runtime, repository: null });
  }

  return Object.freeze({
    runtime,
    repository: createDiscoverRepository(runtime.client, runtime.config)
  });
}
