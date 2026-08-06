import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AGENDA_ITEM_SELECT = [
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
  "updated_at",
  [
    "profile_activities!",
    "activity_occurrences_activity_id_fkey",
    "(",
    "id,",
    "title,",
    "venue_name,",
    "city,",
    "country,",
    "visibility",
    ")"
  ].join("")
].join(",");

function requireId(id, message = "THIS AGENDA ITEM IS NOT AVAILABLE") {
  if (!UUID_PATTERN.test(String(id || ""))) {
    throw new Error(message);
  }

  return id;
}

function requireResult(error, data, fallback) {
  if (error) {
    console.error(error);
    throw new Error(fallback);
  }

  return data;
}

function databaseToAgendaItem(row) {
  const presentation = Array.isArray(row.profile_activities)
    ? row.profile_activities[0] || null
    : row.profile_activities || null;

  return Object.freeze({
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    activityId: row.activity_id,
    occurrenceType: row.occurrence_type || "",
    titleOverride: row.title_override || "",
    title: row.title_override || presentation?.title || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    startTime: row.start_time || "",
    endTime: row.end_time || "",
    timeZone: row.time_zone || "",
    venueName:
      row.venue_name_override ||
      presentation?.venue_name ||
      "",
    city:
      row.city_override ||
      presentation?.city ||
      "",
    country: presentation?.country || "",
    showInAgenda: row.show_in_agenda !== false,
    visibility: row.visibility || "draft",
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    presentation: presentation
      ? Object.freeze({
          id: presentation.id,
          title: presentation.title || "",
          venueName: presentation.venue_name || "",
          city: presentation.city || "",
          country: presentation.country || "",
          visibility: presentation.visibility || "draft"
        })
      : null
  });
}

function createUnavailableRepository() {
  return Object.freeze({
    mode: "prototype",
    initialise: async () => {},
    listManagedProfiles: async () => [],
    listAgendaItems: async () => [],
    getAgendaItem: async () => null,

    async publishAgendaItem() {
      throw new Error("AGENDA REQUIRES THE LOCAL DATABASE");
    },

    async unpublishAgendaItem() {
      throw new Error("AGENDA REQUIRES THE LOCAL DATABASE");
    },

    async deleteAgendaItem() {
      throw new Error("AGENDA REQUIRES THE LOCAL DATABASE");
    }
  });
}

export function createSupabaseAgendaRepository(client) {
  return Object.freeze({
    mode: "local-supabase",

    initialise: async () => {},

    async listManagedProfiles() {
      const { data, error } = await client.rpc(
        "list_manageable_artist_profiles"
      );

      return requireResult(
        error,
        data,
        "ARTIST PROFILES ARE UNAVAILABLE"
      ).map((row) =>
        Object.freeze({
          id: row.id,
          name: row.display_name,
          slug: row.slug,
          publicationStatus: row.publication_status
        })
      );
    },

    async listAgendaItems(profileIds = []) {
      if (!profileIds.length) return [];

      const { data, error } = await client
        .from("activity_occurrences")
        .select(AGENDA_ITEM_SELECT)
        .in("owner_profile_id", profileIds)
        .order("start_date", {
          ascending: true,
          nullsFirst: false
        })
        .order("start_time", {
          ascending: true,
          nullsFirst: false
        })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });

      return requireResult(
        error,
        data,
        "AGENDA ITEMS ARE UNAVAILABLE"
      ).map(databaseToAgendaItem);
    },

    async getAgendaItem(id) {
      const { data, error } = await client
        .from("activity_occurrences")
        .select(AGENDA_ITEM_SELECT)
        .eq("id", requireId(id))
        .maybeSingle();

      const item = requireResult(
        error,
        data,
        "AGENDA ITEM IS UNAVAILABLE"
      );

      return item
        ? databaseToAgendaItem(item)
        : null;
    },

    async publishAgendaItem(id, expectedUpdatedAt) {
      const agendaItemId = requireId(id);

      const { data, error } = await client
        .from("activity_occurrences")
        .update({ visibility: "published" })
        .eq("id", agendaItemId)
        .eq("updated_at", expectedUpdatedAt)
        .select(AGENDA_ITEM_SELECT)
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("AGENDA ITEM COULD NOT BE PUBLISHED");
      }

      if (!data) {
        const { data: current } = await client
          .from("activity_occurrences")
          .select("id")
          .eq("id", agendaItemId)
          .maybeSingle();

        if (current) {
          throw new Error("THIS AGENDA ITEM CHANGED ELSEWHERE");
        }

        throw new Error("THIS AGENDA ITEM IS NOT AVAILABLE");
      }

      return databaseToAgendaItem(data);
    },

    async unpublishAgendaItem(id, expectedUpdatedAt) {
      const agendaItemId = requireId(id);

      const { data, error } = await client
        .from("activity_occurrences")
        .update({ visibility: "draft" })
        .eq("id", agendaItemId)
        .eq("updated_at", expectedUpdatedAt)
        .select(AGENDA_ITEM_SELECT)
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("AGENDA ITEM COULD NOT BE UNPUBLISHED");
      }

      if (!data) {
        const { data: current } = await client
          .from("activity_occurrences")
          .select("id")
          .eq("id", agendaItemId)
          .maybeSingle();

        if (current) {
          throw new Error("THIS AGENDA ITEM CHANGED ELSEWHERE");
        }

        throw new Error("THIS AGENDA ITEM IS NOT AVAILABLE");
      }

      return databaseToAgendaItem(data);
    },

    async deleteAgendaItem(id) {
      const { data, error } = await client.rpc(
        "soft_delete_activity_occurrence",
        { target_occurrence_id: requireId(id) }
      );

      requireResult(
        error,
        data,
        "AGENDA ITEM COULD NOT BE DELETED"
      );
    }
  });
}

export function selectAgendaRepository(runtime) {
  if (
    runtime.mode === FRONTEND_MODES.LOCAL_SUPABASE &&
    runtime.client
  ) {
    return createSupabaseAgendaRepository(runtime.client);
  }

  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return createUnavailableRepository();
  }

  throw new Error("Agenda repository mode is invalid.");
}

export async function getAgendaRepository() {
  const runtime = await getFrontendRuntime();

  return Object.freeze({
    runtime,
    repository: selectAgendaRepository(runtime)
  });
}