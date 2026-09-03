import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { requestPublicRows } from "./public-data-request.mjs";
import {
  isValidPublicPresentationId,
  isValidProfileSlug,
  mapPublishedArtistProfile,
  PUBLIC_PROFILE_SELECT
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUBLIC_PRESENTATION_SELECT = [
  "id",
  "owner_profile_id",
  "title",
  "activity_type",
  "venue_name",
  "city",
  "country",
  "start_date",
  "end_date",
  "description",
  "external_url",
  "show_in_presentations",
  "visibility",
  "published_at",
  "updated_at"
].join(",");

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isPublishedPresentation(row, ownerProfileId) {
  return Boolean(
    row &&
    UUID_PATTERN.test(String(row.id || "")) &&
    row.owner_profile_id === ownerProfileId &&
    row.visibility === "published" &&
    row.show_in_presentations === true &&
    row.published_at &&
    cleanText(row.title) &&
    cleanText(row.activity_type) &&
    cleanText(row.venue_name) &&
    cleanText(row.city) &&
    row.start_date
  );
}

function mapPresentation(row) {
  return Object.freeze({
    id: row.id,
    title: cleanText(row.title),
    activityType: cleanText(row.activity_type),
    venueName: cleanText(row.venue_name),
    city: cleanText(row.city),
    country: cleanText(row.country),
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    description: cleanText(row.description),
    externalUrl: cleanText(row.external_url),
    publishedAt: row.published_at,
    updatedAt: row.updated_at
  });
}

export function createPublicPresentationRepository(
  config,
  request = requestPublicRows
) {
  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,

    async getPresentation(id) {
      if (!isValidPublicPresentationId(id)) {
        return Object.freeze({ kind: "unavailable" });
      }

      const presentationQuery = new URLSearchParams({
        select: PUBLIC_PRESENTATION_SELECT,
        id: `eq.${id}`,
        visibility: "eq.published",
        show_in_presentations: "eq.true",
        published_at: "not.is.null",
        limit: "1"
      });
      const rows = await request(
        config,
        "profile_activities",
        presentationQuery
      );
      const presentationRow = rows[0];

      if (!presentationRow) {
        return Object.freeze({ kind: "unavailable" });
      }

      const profileQuery = new URLSearchParams({
        select: PUBLIC_PROFILE_SELECT,
        id: `eq.${presentationRow.owner_profile_id}`,
        profile_type: "eq.artist",
        publication_status: "eq.published",
        limit: "1"
      });
      const profiles = await request(
        config,
        "public_profiles",
        profileQuery
      );
      const profileRow = profiles[0];
      const profile = mapPublishedArtistProfile(profileRow);

      if (
        !profileRow ||
        !profile ||
        profile.showPresentations !== true ||
        !isPublishedPresentation(
          presentationRow,
          profileRow.id
        )
      ) {
        return Object.freeze({ kind: "unavailable" });
      }

      return Object.freeze({
        kind: "available",
        profile: Object.freeze({ ...profile, id: profileRow.id }),
        presentation: mapPresentation(presentationRow)
      });
    },

    async getProfilePresentations(slug) {
      if (!isValidProfileSlug(slug)) {
        return Object.freeze({
          kind: "unavailable"
        });
      }

      const profileQuery = new URLSearchParams({
        select: PUBLIC_PROFILE_SELECT,
        slug: `eq.${slug}`,
        profile_type: "eq.artist",
        publication_status: "eq.published",
        limit: "1"
      });

      const profiles = await request(
        config,
        "public_profiles",
        profileQuery
      );

      const profileRow = profiles[0];
      const mappedProfile =
        mapPublishedArtistProfile(profileRow);

      if (!profileRow || !mappedProfile) {
        return Object.freeze({
          kind: "unavailable"
        });
      }

      const presentationQuery = new URLSearchParams({
        select: PUBLIC_PRESENTATION_SELECT,
        owner_profile_id: `eq.${profileRow.id}`,
        visibility: "eq.published",
        show_in_presentations: "eq.true",
        published_at: "not.is.null",
        order:
          "start_date.desc.nullslast,published_at.desc,id.asc"
      });

      const rows = await request(
        config,
        "profile_activities",
        presentationQuery
      );

      const presentations = rows
        .filter((row) =>
          isPublishedPresentation(row, profileRow.id)
        )
        .map(mapPresentation);

      const hasPublicCv =
        await hasPublicCvForProfile(
          config,
          profileRow.id,
          request
        );

      const hasPublicAgenda =
        await hasPublicAgendaForProfile(
          config,
          profileRow.id,
          request
        );

      const hasPublicPress =
        await hasPublicPressForProfile(
          config,
          profileRow.id,
          request
        );

      return Object.freeze({
        kind: "available",
        profile: Object.freeze({
          ...mappedProfile,
          id: profileRow.id
        }),
        presentations,
        hasPublicCv,
        hasPublicAgenda,
        hasPublicPress
      });
    }
  });
}

export async function getPublicPresentationRepository() {
  const runtime = await getFrontendRuntime();

  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return Object.freeze({
      runtime,
      repository: null
    });
  }

  return Object.freeze({
    runtime,
    repository:
      createPublicPresentationRepository(runtime.config)
  });
}
