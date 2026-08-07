import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import {
  createPublicImageUrl,
  requestPublicRows
} from "./public-data-request.mjs";
import {
  isValidProfileSlug,
  mapPublicProfileResult,
  PUBLIC_COVER_SELECT,
  PUBLIC_PROFILE_SELECT,
  PUBLIC_WORK_SELECT
} from "./public-work-mapping.mjs";
import {
  hasPublicCvForProfile
} from "./public-cv-repository.mjs";
import {
  hasPublicAgendaForProfile
} from "./public-agenda-repository.mjs";
import {
  hasPublicPressForProfile
} from "./public-press-repository.mjs";

function inFilter(ids) {
  return `in.(${ids.join(",")})`;
}

const PROFILE_WORK_PAGE_SIZE = 100;

function withFollowIdentity(
  mapped,
  profile,
  hasPublicPresentations = false,
  hasPublicCv = false,
  hasPublicAgenda = false,
  hasPublicPress = false
) {
  if (mapped.kind !== "available") return mapped;

  return Object.freeze({
    ...mapped,
    hasPublicPresentations: Boolean(hasPublicPresentations),
    hasPublicCv: Boolean(hasPublicCv),
    hasPublicAgenda: Boolean(hasPublicAgenda),
    hasPublicPress: Boolean(hasPublicPress),
    followIdentity: Object.freeze({
      id: profile.id,
      slug: profile.slug
    })
  });
}

export function createPublicProfileRepository(
  client,
  config,
  request = requestPublicRows
) {
  return Object.freeze({
    mode: FRONTEND_MODES.LOCAL_SUPABASE,

    async getProfile(slug) {
      if (!isValidProfileSlug(slug)) {
        return Object.freeze({ kind: "unavailable" });
      }

      const profileQuery = new URLSearchParams({
        select: PUBLIC_PROFILE_SELECT,
        slug: `eq.${slug}`,
        profile_type: "eq.artist",
        publication_status: "eq.published",
        limit: "1"
      });
      const profiles = await request(config, "public_profiles", profileQuery);
      if (!profiles[0]) return Object.freeze({ kind: "unavailable" });

      const presentationQuery = new URLSearchParams({
        select: "id",
        owner_profile_id: `eq.${profiles[0].id}`,
        visibility: "eq.published",
        show_in_presentations: "eq.true",
        published_at: "not.is.null",
        limit: "1"
      });

      const publicPresentations = await request(
        config,
        "profile_activities",
        presentationQuery
      );

      const hasPublicPresentations =
        Boolean(publicPresentations[0]);

      const hasPublicCv =
        await hasPublicCvForProfile(
          config,
          profiles[0].id,
          request
        );

      const hasPublicAgenda =
        await hasPublicAgendaForProfile(
          config,
          profiles[0].id,
          request
        );

      const hasPublicPress =
        await hasPublicPressForProfile(
          config,
          profiles[0].id,
          request
        );

      const works = [];
      let offset = 0;
      let workPage;

      do {
        const workQuery = new URLSearchParams({
          select: PUBLIC_WORK_SELECT,
          owner_profile_id: `eq.${profiles[0].id}`,
          visibility: "eq.published",
          published_at: "not.is.null",
          order: "year_sort.desc.nullslast,updated_at.desc,id.asc",
          limit: String(PROFILE_WORK_PAGE_SIZE),
          offset: String(offset)
        });
        workPage = await request(config, "works", workQuery);
        works.push(...workPage);
        offset += workPage.length;
      } while (workPage.length === PROFILE_WORK_PAGE_SIZE);

      if (!works.length) {
        return withFollowIdentity(
          mapPublicProfileResult(
            profiles[0],
            [],
            [],
            (path) => createPublicImageUrl(client, path)
          ),
          profiles[0],
          hasPublicPresentations,
          hasPublicCv,
          hasPublicAgenda,
          hasPublicPress
        );
      }

      const images = [];
      for (let start = 0; start < works.length; start += PROFILE_WORK_PAGE_SIZE) {
        const imageQuery = new URLSearchParams({
          select: PUBLIC_COVER_SELECT,
          work_id: inFilter(
            works.slice(start, start + PROFILE_WORK_PAGE_SIZE).map((work) => work.id)
          ),
          is_cover: "eq.true",
          public_object_path: "not.is.null",
          order: "work_id.asc,id.asc"
        });
        images.push(...await request(config, "work_images", imageQuery));
      }

      const mapped = mapPublicProfileResult(
        profiles[0],
        works,
        images,
        (path) => createPublicImageUrl(client, path)
      );

      return withFollowIdentity(
        mapped,
        profiles[0],
        hasPublicPresentations,
        hasPublicCv,
        hasPublicAgenda,
        hasPublicPress
      );
    }
  });
}

export async function getPublicProfileRepository() {
  const runtime = await getFrontendRuntime();
  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return Object.freeze({ runtime, repository: null });
  }

  return Object.freeze({
    runtime,
    repository: createPublicProfileRepository(runtime.client, runtime.config)
  });
}
