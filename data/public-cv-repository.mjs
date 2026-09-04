import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { requestPublicRows } from "./public-data-request.mjs";
import {
  isValidProfileSlug,
  mapPublishedArtistProfile,
  PUBLIC_PROFILE_SELECT
} from "./public-work-mapping.mjs";
import {
  hasPublicAgendaForProfile
} from "./public-agenda-repository.mjs";
import {
  hasPublicPressForProfile
} from "./public-press-repository.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_SELECT = [
  "id",
  "profile_id",
  "category_type",
  "label",
  "display_order",
  "is_visible"
].join(",");

const ENTRY_SELECT = [
  "id",
  "category_id",
  "source_activity_id",
  "year_label",
  "title",
  "organization",
  "location_text",
  "url",
  "display_order",
  "is_visible",
  "created_at"
].join(",");

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function inFilter(ids) {
  return `in.(${ids.join(",")})`;
}

function uuidArrayParameter(ids) {
  return `{${ids.join(",")}}`;
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

function automaticYear(activity) {
  const startYear =
    cleanText(activity?.startDate).slice(0, 4);

  const endYear =
    cleanText(activity?.endDate).slice(0, 4);

  if (!startYear) return "";

  if (!endYear || endYear === startYear) {
    return startYear;
  }

  return `${startYear}–${endYear}`;
}

function mapActivity(row) {
  if (!row) return null;

  return Object.freeze({
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    title: cleanText(row.title),
    activityType: cleanText(row.activity_type),
    venueName: cleanText(row.venue_name),
    city: cleanText(row.city),
    country: cleanText(row.country),
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    externalUrl: cleanText(row.external_url)
  });
}

function isPublicActivity(row, ownerProfileId) {
  return Boolean(
    row &&
    UUID_PATTERN.test(String(row.id || "")) &&
    row.owner_profile_id === ownerProfileId &&
    cleanText(row.title)
  );
}

function mapEntry(row, activity) {
  const isAutomatic =
    Boolean(row.source_activity_id);

  const yearLabel =
    isAutomatic
      ? automaticYear(activity)
      : cleanText(row.year_label);

  const line =
    isAutomatic
      ? [
          activity?.title,
          activity?.venueName,
          [activity?.city, activity?.country]
            .filter(Boolean)
            .join(", ")
        ]
          .filter(Boolean)
          .join(", ")
      : [
          cleanText(row.title),
          cleanText(row.organization),
          cleanText(row.location_text)
        ]
          .filter(Boolean)
          .join(", ");

  return Object.freeze({
    id: row.id,
    categoryId: row.category_id,
    yearLabel,
    line,
    url:
      isAutomatic
        ? cleanText(activity?.externalUrl)
        : cleanText(row.url),
    createdAt: row.created_at || "",
    yearScore: yearScore(yearLabel)
  });
}

async function getVisibleCategories(
  config,
  profileId,
  request
) {
  const query = new URLSearchParams({
    select: CATEGORY_SELECT,
    profile_id: `eq.${profileId}`,
    is_visible: "eq.true",
    order: "display_order.asc,id.asc"
  });

  return request(
    config,
    "cv_categories",
    query
  );
}

async function getVisibleEntries(
  config,
  categoryIds,
  request,
  limit = null
) {
  if (!categoryIds.length) return [];

  const params = {
    select: ENTRY_SELECT,
    category_id: inFilter(categoryIds),
    is_visible: "eq.true",
    order: "display_order.asc,id.asc"
  };

  if (limit) {
    params.limit = String(limit);
  }

  return request(
    config,
    "cv_entries",
    new URLSearchParams(params)
  );
}

export async function hasPublicCvForProfile(
  config,
  profileId,
  request = requestPublicRows
) {
  if (!UUID_PATTERN.test(String(profileId || ""))) {
    return false;
  }

  const categories =
    await getVisibleCategories(
      config,
      profileId,
      request
    );

  if (!categories.length) return false;

  const entries =
    await getVisibleEntries(
      config,
      categories.map((category) => category.id),
      request,
      1
    );

  return Boolean(entries[0]);
}

export function createPublicCvRepository(
  config,
  request = requestPublicRows
) {
  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,

    async getProfileCv(slug) {
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
        mapPublishedArtistProfile(profileRow);

      if (!profileRow || !mappedProfile) {
        return Object.freeze({
          kind: "unavailable"
        });
      }

      const presentationQuery =
        new URLSearchParams({
          select: "id",
          owner_profile_id: `eq.${profileRow.id}`,
          visibility: "eq.published",
          show_in_presentations: "eq.true",
          published_at: "not.is.null",
          limit: "1"
        });

      const publicPresentations =
        await request(
          config,
          "profile_activities",
          presentationQuery
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

      const categories =
        await getVisibleCategories(
          config,
          profileRow.id,
          request
        );

      if (!categories.length) {
        return Object.freeze({
          kind: "available",
          profile: Object.freeze({
            ...mappedProfile,
            id: profileRow.id
          }),
          hasPublicPresentations:
            Boolean(publicPresentations[0]),
          hasPublicAgenda,
          hasPublicPress,
          categories: Object.freeze([])
        });
      }

      const entryRows =
        await getVisibleEntries(
          config,
          categories.map(
            (category) => category.id
          ),
          request
        );

      const activityIds = [
        ...new Set(
          entryRows
            .map(
              (entry) =>
                entry.source_activity_id
            )
            .filter(Boolean)
        )
      ];

      const activityMap = new Map();

      if (activityIds.length) {
        const activityQuery =
          new URLSearchParams({
            target_activity_ids:
              uuidArrayParameter(activityIds)
          });

        const activityRows =
          await request(
            config,
            "rpc/get_public_activity_source_contexts",
            activityQuery
          );

        activityRows
          .map((row) => ({
            ...row,
            id: row.activity_id
          }))
          .filter((row) =>
            isPublicActivity(row, profileRow.id)
          )
          .forEach((row) => {
            activityMap.set(
              row.id,
              mapActivity(row)
            );
          });
      }

      const entriesByCategory =
        new Map();

      entryRows.forEach((row) => {
        const automatic =
          Boolean(row.source_activity_id);

        const activity =
          automatic
            ? activityMap.get(
                row.source_activity_id
              )
            : null;

        if (automatic && !activity) {
          return;
        }

        const mapped =
          mapEntry(row, activity);

        if (!mapped.line) return;

        const list =
          entriesByCategory.get(
            row.category_id
          ) || [];

        list.push(mapped);

        entriesByCategory.set(
          row.category_id,
          list
        );
      });

      const mappedCategories =
        categories
          .map((category) => {
            const entries = [
              ...(entriesByCategory.get(
                category.id
              ) || [])
            ].sort((first, second) => {
              const yearDifference =
                second.yearScore -
                first.yearScore;

              if (yearDifference) {
                return yearDifference;
              }

              return String(
                second.createdAt
              ).localeCompare(
                String(first.createdAt)
              );
            });

            return Object.freeze({
              id: category.id,
              label: cleanText(
                category.label
              ),
              displayOrder:
                category.display_order,
              entries: Object.freeze(
                entries
              )
            });
          })
          .filter(
            (category) =>
              category.label &&
              category.entries.length
          );

      return Object.freeze({
        kind: "available",
        profile: Object.freeze({
          ...mappedProfile,
          id: profileRow.id
        }),
        hasPublicPresentations:
          Boolean(publicPresentations[0]),
        hasPublicAgenda,
        hasPublicPress,
        categories: Object.freeze(
          mappedCategories
        )
      });
    }
  });
}

export async function getPublicCvRepository() {
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
      createPublicCvRepository(
        runtime.config
      )
  });
}
