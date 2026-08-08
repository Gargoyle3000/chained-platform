import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { requestPublicRows } from "./public-data-request.mjs";
import {
  isValidProfileSlug,
  mapPublishedArtistProfile,
  PUBLIC_PROFILE_SELECT
} from "./public-work-mapping.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRESS_SELECT = [
  "id",
  "owner_profile_id",
  "year_label",
  "title",
  "author",
  "body",
  "url",
  "is_visible",
  "created_at"
].join(",");

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function yearScore(value) {
  const years =
    cleanText(value).match(/\d{4}/g) || [];

  if (!years.length) return 0;

  return Math.max(
    ...years.map((year) =>
      Number.parseInt(year, 10)
    )
  );
}

function mapPressItem(row) {
  return Object.freeze({
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    yearLabel: cleanText(row.year_label),
    title: cleanText(row.title),
    author: cleanText(row.author),
    body: cleanText(row.body),
    url: cleanText(row.url),
    createdAt: row.created_at || "",
    yearScore: yearScore(row.year_label)
  });
}

function sortPressItems(items) {
  return [...items].sort((first, second) => {
    const yearDifference =
      second.yearScore - first.yearScore;

    if (yearDifference) {
      return yearDifference;
    }

    const secondCreated =
      new Date(second.createdAt || 0).getTime();

    const firstCreated =
      new Date(first.createdAt || 0).getTime();

    if (secondCreated !== firstCreated) {
      return secondCreated - firstCreated;
    }

    return String(first.id).localeCompare(
      String(second.id)
    );
  });
}

async function getVisiblePressItems(
  config,
  profileId,
  request,
  limit = null
) {
  if (
    !UUID_PATTERN.test(
      String(profileId || "")
    )
  ) {
    return [];
  }

  const params = {
    select: PRESS_SELECT,
    owner_profile_id: `eq.${profileId}`,
    is_visible: "eq.true",
    order: "created_at.desc,id.asc"
  };

  if (limit) {
    params.limit = String(limit);
  }

  return request(
    config,
    "profile_press_items",
    new URLSearchParams(params)
  );
}

export async function hasPublicPressForProfile(
  config,
  profileId,
  request = requestPublicRows
) {
  const rows =
    await getVisiblePressItems(
      config,
      profileId,
      request,
      1
    );

  return Boolean(rows[0]);
}

export function createPublicPressRepository(
  config,
  request = requestPublicRows
) {
  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,

    async getProfilePress(slug) {
      if (!isValidProfileSlug(slug)) {
        return Object.freeze({
          kind: "unavailable"
        });
      }

      const profileQuery =
        new URLSearchParams({
          select: PUBLIC_PROFILE_SELECT,
          slug: `eq.${slug}`,
          profile_type: "eq.artist",
          publication_status: "eq.published",
          limit: "1"
        });

      const profiles =
        await request(
          config,
          "public_profiles",
          profileQuery
        );

      const profileRow = profiles[0];

      const mappedProfile =
        mapPublishedArtistProfile(
          profileRow
        );

      if (!profileRow || !mappedProfile) {
        return Object.freeze({
          kind: "unavailable"
        });
      }

      const rows =
        await getVisiblePressItems(
          config,
          profileRow.id,
          request
        );

      const items =
        sortPressItems(
          rows
            .map(mapPressItem)
            .filter(
              (item) =>
                item.yearLabel &&
                item.title
            )
        );

      return Object.freeze({
        kind: "available",

        profile: Object.freeze({
          ...mappedProfile,
          id: profileRow.id
        }),

        items: Object.freeze(items)
      });
    }
  });
}

export async function getPublicPressRepository() {
  const runtime =
    await getFrontendRuntime();

  if (
    runtime.mode === FRONTEND_MODES.PROTOTYPE
  ) {
    return Object.freeze({
      runtime,
      repository: null
    });
  }

  return Object.freeze({
    runtime,
    repository:
      createPublicPressRepository(
        runtime.config
      )
  });
}