import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { requestPublicRows } from "./public-data-request.mjs";
import {
  createPublicPresentationLink
} from "./public-work-mapping.mjs";

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

const PROFILE_SELECT = [
  "id",
  "slug",
  "display_name",
  "profile_type",
  "publication_status",
  "published_at"
].join(",");

const PRESENTATION_SELECT = [
  "id",
  "owner_profile_id",
  "external_url",
  "show_in_presentations",
  "visibility",
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

function uuidArrayParameter(ids) {
  return `{${ids.join(",")}}`;
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
    UUID_PATTERN.test(String(row.id || "")) &&
    row.owner_profile_id === ownerProfileId &&
    cleanText(row.title)
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
    country: cleanText(row.country),
    externalUrl: cleanText(row.external_url)
  });
}

function mapProfile(row) {
  return Object.freeze({
    id: row.id,
    slug: cleanText(row.slug),
    displayName: cleanText(row.display_name),
    showPresentations: row.show_presentations !== false
  });
}

function isPublicPresentation(row, activity, profile) {
  return Boolean(
    row &&
    activity &&
    profile &&
    row.id === activity.id &&
    row.owner_profile_id === activity.ownerProfileId &&
    row.owner_profile_id === profile.id &&
    row.visibility === "published" &&
    row.show_in_presentations === true &&
    row.published_at &&
    profile.showPresentations === true
  );
}

function mapAgendaThumbnail(config, row) {
  if (row?.thumbnail_kind === "dedicated" && UUID_PATTERN.test(String(row?.dedicated_image_id || ""))) {
    return Object.freeze({
      kind: "dedicated",
      src: `${config.supabaseUrl}/functions/v1/public-presentation-agenda-image?presentation_id=${encodeURIComponent(row.presentation_id)}&v=${encodeURIComponent(row.dedicated_updated_at || row.dedicated_image_id)}`
    });
  }
  if (row?.thumbnail_kind === "work") {
    const path = String(row.work_public_object_path || "");
    // A canonical public Work SMALL derivative is scoped by profile, Work,
    // publication revision and image. Do not turn a valid four-UUID path
    // into a missing Agenda thumbnail by accepting the obsolete three-part
    // shape here.
    if (!/^[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\/small\.webp$/.test(path)) return null;
    return Object.freeze({ kind: "work", src: `${config.supabaseUrl}/storage/v1/object/public/work-public/${path}` });
  }
  return null;
}

function mapOccurrence(row, activity, profile, presentation, thumbnail) {
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
    externalUrl:
      cleanText(presentation?.external_url) ||
      cleanText(activity?.externalUrl),
    presentationHref: isPublicPresentation(
      presentation,
      activity,
      profile
    )
      ? createPublicPresentationLink(activity.id)
      : null,
    artist: profile,
    activity,
    thumbnail
  });
}

function mapFollowedAgendaOccurrence(config, row, today) {
  if (
    !row ||
    !UUID_PATTERN.test(String(row.occurrence_id || "")) ||
    !UUID_PATTERN.test(String(row.owner_profile_id || "")) ||
    !isCurrentOrFuture(row, today)
  ) {
    return null;
  }

  const profile = Object.freeze({
    id: row.owner_profile_id,
    slug: cleanText(row.artist_slug),
    displayName: cleanText(row.artist_display_name),
    showPresentations: true
  });

  const title = cleanText(row.title);
  const occurrenceType = cleanText(row.occurrence_type);

  if (!profile.slug || !profile.displayName || !title || !occurrenceType) {
    return null;
  }

  const presentationId = cleanText(row.presentation_id);

  return Object.freeze({
    id: row.occurrence_id,
    ownerProfileId: row.owner_profile_id,
    activityId: cleanText(row.activity_id) || null,
    occurrenceType,
    title,
    startDate: cleanText(row.start_date),
    endDate: cleanText(row.end_date),
    startTime: cleanText(row.start_time),
    endTime: cleanText(row.end_time),
    timeZone: cleanText(row.time_zone),
    venueName: cleanText(row.venue_name),
    city: cleanText(row.city),
    country: cleanText(row.country),
    externalUrl: cleanText(row.external_url),
    presentationHref: UUID_PATTERN.test(presentationId)
      ? createPublicPresentationLink(presentationId)
      : null,
    artist: profile,
    activity: null,
    thumbnail: mapAgendaThumbnail(config, row)
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
    target_activity_ids: uuidArrayParameter(ids)
  });

  const activityRows = await request(
    config,
    "rpc/get_public_activity_source_contexts",
    query
  );

  return new Map(
    activityRows.map((row) => [
      row.activity_id,
      mapActivity({
        ...row,
        id: row.activity_id
      })
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

async function resolvePublicPresentations(
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
    select: PRESENTATION_SELECT,
    id: inFilter(ids),
    visibility: "eq.published",
    show_in_presentations: "eq.true",
    published_at: "not.is.null"
  });

  const presentationRows = await request(
    config,
    "profile_activities",
    query
  );

  return new Map(
    presentationRows.map((row) => [row.id, row])
  );
}

async function resolveAgendaThumbnails(config, request, rows) {
  const ids = [...new Set(rows.map((row) => row.activity_id).filter((id) => UUID_PATTERN.test(String(id || ""))))];
  if (!ids.length) return new Map();
  const query = new URLSearchParams({ target_presentation_ids: uuidArrayParameter(ids) });
  const thumbnailRows = await request(config, "rpc/get_public_agenda_thumbnail_contexts", query);
  return new Map(thumbnailRows.map((row) => [row.presentation_id, row]));
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

  const [activities, profiles, presentations, thumbnails] =
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
      ),
      resolvePublicPresentations(
        config,
        request,
        publicRows
      ),
      resolveAgendaThumbnails(
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
                activity.ownerProfileId
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
          profile,
        presentations.get(row.activity_id),
        mapAgendaThumbnail(config, thumbnails.get(row.activity_id))
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

export function createFollowedAgendaRepository(
  client,
  today = localToday()
) {
  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,

    async listAgenda() {
      const { data, error } = await client.rpc(
        "list_followed_agenda"
      );

      if (error) throw error;

      return Object.freeze(
        (Array.isArray(data) ? data : [])
          .map((row) =>
          mapFollowedAgendaOccurrence({ supabaseUrl: String(client.supabaseUrl || "") }, row, today)
          )
          .filter(Boolean)
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
      ),
    followedRepository:
      createFollowedAgendaRepository(runtime.client)
  });
}
