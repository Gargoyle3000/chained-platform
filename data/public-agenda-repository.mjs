import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { requestPublicRows } from "./public-data-request.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OCCURRENCE_SELECT = [
  "id",
  "owner_profile_id",
  "activity_id",
  "occurrence_type",
  "title_override",
  "start_date",
  "end_date",
  "start_time",
  "end_time",
  "time_zone",
  "venue_name_override",
  "city_override",
  "show_in_agenda",
  "visibility",
  "published_at",
  "created_at",
  "updated_at"
].join(",");

const ACTIVITY_SELECT = [
  "id",
  "owner_profile_id",
  "title",
  "activity_type",
  "venue_name",
  "city",
  "country",
  "visibility",
  "published_at"
].join(",");

const PROFILE_SELECT = [
  "id",
  "slug",
  "display_name",
  "profile_type",
  "publication_status",
  "published_at"
].join(",");

function cleanText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function inFilter(ids) {
  return `in.(${ids.join(",")})`;
}

function localToday() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isCurrentOrFuture(row, today) {
  const start = cleanText(row?.start_date);
  const end = cleanText(row?.end_date);

  if (!start) return false;

  return (end || start) >= today;
}

function isPublicOccurrence(row, today) {
  return Boolean(
    row &&
    UUID_PATTERN.test(String(row.id || "")) &&
    UUID_PATTERN.test(String(row.owner_profile_id || "")) &&
    row.show_in_agenda === true &&
    row.visibility === "published" &&
    row.published_at &&
    isCurrentOrFuture(row, today)
  );
}

function isPublicActivity(row, ownerProfileId) {
  return Boolean(
    row &&
    row.owner_profile_id === ownerProfileId &&
    row.visibility === "published" &&
    row.published_at
  );
}

function isPublicArtistProfile(row) {
  return Boolean(
    row &&
    UUID_PATTERN.test(String(row.id || "")) &&
    cleanText(row.slug) &&
    cleanText(row.display_name) &&
    row.profile_type === "artist" &&
    row.publication_status === "published" &&
    row.published_at
  );
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
    country: cleanText(row.country)
  });
}

function mapProfile(row) {
  return Object.freeze({
    id: row.id,
    slug: cleanText(row.slug),
    displayName: cleanText(row.display_name)
  });
}

function mapOccurrence(row, activity, profile) {
  const title =
    cleanText(row.title_override) ||
    cleanText(activity?.title);

  const venueName =
    cleanText(row.venue_name_override) ||
    cleanText(activity?.venueName);

  const city =
    cleanText(row.city_override) ||
    cleanText(activity?.city);

  return Object.freeze({
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    activityId: row.activity_id || null,
    occurrenceType: cleanText(row.occurrence_type),
    title,
    startDate: cleanText(row.start_date),
    endDate: cleanText(row.end_date),
    startTime: cleanText(row.start_time),
    endTime: cleanText(row.end_time),
    timeZone: cleanText(row.time_zone),
    venueName,
    city,
    country: cleanText(activity?.country),
    artist: profile,
    activity
  });
}

async function requestOccurrences(
  config,
  request,
  profileId = null
) {
  const params = {
    select: OCCURRENCE_SELECT,
    show_in_agenda: "eq.true",
    visibility: "eq.published",
    published_at: "not.is.null",
    order: "start_date.asc,start_time.asc,id.asc"
  };

  if (profileId) {
    params.owner_profile_id = `eq.${profileId}`;
  }

  return request(
    config,
    "activity_occurrences",
    new URLSearchParams(params)
  );
}

async function resolveActivities(
  config,
  request,
  rows
) {
  const ids = [
    ...new Set(
      rows
        .map((row) => row.activity_id)
        .filter(Boolean)
    )
  ];

  if (!ids.length) return new Map();

  const query = new URLSearchParams({
    select: ACTIVITY_SELECT,
    id: inFilter(ids)
  });

  const activityRows = await request(
    config,
    "profile_activities",
    query
  );

  return new Map(
    activityRows.map((row) => [
      row.id,
      mapActivity(row)
    ])
  );
}

async function resolveProfiles(
  config,
  request,
  rows
) {
  const ids = [
    ...new Set(
      rows
        .map((row) => row.owner_profile_id)
        .filter(Boolean)
    )
  ];

  if (!ids.length) return new Map();

  const query = new URLSearchParams({
    select: PROFILE_SELECT,
    id: inFilter(ids),
    profile_type: "eq.artist",
    publication_status: "eq.published"
  });

  const profileRows = await request(
    config,
    "public_profiles",
    query
  );

  return new Map(
    profileRows
      .filter(isPublicArtistProfile)
      .map((row) => [
        row.id,
        mapProfile(row)
      ])
  );
}

async function mapPublicAgendaRows(
  config,
  request,
  rows,
  today
) {
  const publicRows =
    rows.filter((row) =>
      isPublicOccurrence(row, today)
    );

  const [activities, profiles] =
    await Promise.all([
      resolveActivities(
        config,
        request,
        publicRows
      ),
      resolveProfiles(
        config,
        request,
        publicRows
      )
    ]);

  return publicRows
    .map((row) => {
      const profile =
        profiles.get(row.owner_profile_id);

      if (!profile) return null;

      let activity = null;

      if (row.activity_id) {
        activity =
          activities.get(row.activity_id) || null;

        if (
          !isPublicActivity(
            activity && {
              ...activity,
              owner_profile_id:
                activity.ownerProfileId,
              visibility: "published",
              published_at: true
            },
            row.owner_profile_id
          )
        ) {
          activity = null;
        }
      }

      const mapped =
        mapOccurrence(
          row,
          activity,
          profile
        );

      if (
        !mapped.title ||
        !mapped.occurrenceType
      ) {
        return null;
      }

      return mapped;
    })
    .filter(Boolean);
}

export function createPublicAgendaRepository(
  config,
  request = requestPublicRows,
  today = localToday()
) {
  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,

    async listAgenda() {
      const rows =
        await requestOccurrences(
          config,
          request
        );

      return Object.freeze(
        await mapPublicAgendaRows(
          config,
          request,
          rows,
          today
        )
      );
    },

    async listProfileAgenda(profileId) {
      if (
        !UUID_PATTERN.test(
          String(profileId || "")
        )
      ) {
        return Object.freeze([]);
      }

      const rows =
        await requestOccurrences(
          config,
          request,
          profileId
        );

      return Object.freeze(
        await mapPublicAgendaRows(
          config,
          request,
          rows,
          today
        )
      );
    }
  });
}

export async function hasPublicAgendaForProfile(
  config,
  profileId,
  request = requestPublicRows,
  today = localToday()
) {
  const repository =
    createPublicAgendaRepository(
      config,
      request,
      today
    );

  const items =
    await repository.listProfileAgenda(
      profileId
    );

  return items.length > 0;
}

export async function getPublicAgendaRepository() {
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
      createPublicAgendaRepository(
        runtime.config
      )
  });
}