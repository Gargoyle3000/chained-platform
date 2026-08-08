import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRESENTATION_SELECT = [
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
  "include_in_cv",
  "visibility",
  "published_at",
  "created_at",
  "updated_at"
].join(",");

function requireId(id, message = "THIS PRESENTATION IS NOT AVAILABLE") {
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

function cleanText(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function databaseToPresentation(row) {
  return Object.freeze({
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    title: row.title || "",
    activityType: row.activity_type || "",
    venueName: row.venue_name || "",
    city: row.city || "",
    country: row.country || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    description: row.description || "",
    externalUrl: row.external_url || "",
    showInPresentations: row.show_in_presentations !== false,
    includeInCv: row.include_in_cv === true,
    visibility: row.visibility || "draft",
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function presentationToDatabase(record) {
  return {
    title: String(record.title ?? "").trim(),
    activity_type: String(record.activityType ?? "").trim(),
    venue_name: String(record.venueName ?? "").trim(),
    city: String(record.city ?? "").trim(),
    country: cleanText(record.country),
    start_date: cleanText(record.startDate),
    end_date: cleanText(record.endDate),
    description: cleanText(record.description),
    external_url: cleanText(record.externalUrl),
    show_in_presentations: record.showInPresentations !== false,
    include_in_cv: record.includeInCv === true
  };
}

function createUnavailableRepository() {
  return Object.freeze({
    mode: "prototype",
    initialise: async () => {},
    listManagedProfiles: async () => [],
    listPresentations: async () => [],
    getPresentation: async () => null,
    async createPresentation() {
      throw new Error("PRESENTATIONS REQUIRE THE LOCAL DATABASE");
    },
    async updatePresentation() {
      throw new Error("PRESENTATIONS REQUIRE THE LOCAL DATABASE");
    },
    async publishPresentation() {
      throw new Error("PRESENTATIONS REQUIRE THE LOCAL DATABASE");
    },
    async unpublishPresentation() {
      throw new Error("PRESENTATIONS REQUIRE THE LOCAL DATABASE");
    },
    async deletePresentation() {
      throw new Error("PRESENTATIONS REQUIRE THE LOCAL DATABASE");
    }
  });
}

export function createSupabasePresentationRepository(client) {
  return Object.freeze({
    mode: "supabase",

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

    async listPresentations(profileIds = []) {
      if (!profileIds.length) return [];

      const { data, error } = await client
        .from("profile_activities")
        .select(PRESENTATION_SELECT)
        .in("owner_profile_id", profileIds)
        .order("start_date", {
          ascending: false,
          nullsFirst: false
        })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });

      return requireResult(
        error,
        data,
        "PRESENTATIONS ARE UNAVAILABLE"
      ).map(databaseToPresentation);
    },

    async getPresentation(id) {
      const { data, error } = await client
        .from("profile_activities")
        .select(PRESENTATION_SELECT)
        .eq("id", requireId(id))
        .maybeSingle();

      const presentation = requireResult(
        error,
        data,
        "PRESENTATION IS UNAVAILABLE"
      );

      return presentation
        ? databaseToPresentation(presentation)
        : null;
    },

    async createPresentation(record, ownerProfileId) {
      const payload = {
        owner_profile_id: requireId(
          ownerProfileId,
          "ARTIST PROFILE IS UNAVAILABLE"
        ),
        ...presentationToDatabase(record)
      };

      const { data, error } = await client
        .from("profile_activities")
        .insert(payload)
        .select(PRESENTATION_SELECT)
        .single();

      return databaseToPresentation(
        requireResult(error, data, "PRESENTATION COULD NOT BE SAVED")
      );
    },

    async updatePresentation(record, expectedUpdatedAt) {
      requireId(record.id);

      const { data, error } = await client
        .from("profile_activities")
        .update(presentationToDatabase(record))
        .eq("id", record.id)
        .eq("updated_at", expectedUpdatedAt)
        .select(PRESENTATION_SELECT)
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("PRESENTATION COULD NOT BE SAVED");
      }

      if (!data) {
        const { data: current } = await client
          .from("profile_activities")
          .select("id")
          .eq("id", record.id)
          .maybeSingle();

        if (current) {
          throw new Error("THIS PRESENTATION CHANGED ELSEWHERE");
        }

        throw new Error("THIS PRESENTATION IS NOT AVAILABLE");
      }

      return databaseToPresentation(data);
    },

    async publishPresentation(id, expectedUpdatedAt) {
      const presentationId = requireId(id);

      const { data, error } = await client
        .from("profile_activities")
        .update({ visibility: "published" })
        .eq("id", presentationId)
        .eq("updated_at", expectedUpdatedAt)
        .select(PRESENTATION_SELECT)
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("PRESENTATION COULD NOT BE PUBLISHED");
      }

      if (!data) {
        const { data: current } = await client
          .from("profile_activities")
          .select("id")
          .eq("id", presentationId)
          .maybeSingle();

        if (current) {
          throw new Error("THIS PRESENTATION CHANGED ELSEWHERE");
        }

        throw new Error("THIS PRESENTATION IS NOT AVAILABLE");
      }

      return databaseToPresentation(data);
    },

    async unpublishPresentation(id, expectedUpdatedAt) {
      const presentationId = requireId(id);

      const { data, error } = await client
        .from("profile_activities")
        .update({ visibility: "draft" })
        .eq("id", presentationId)
        .eq("updated_at", expectedUpdatedAt)
        .select(PRESENTATION_SELECT)
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("PRESENTATION COULD NOT BE UNPUBLISHED");
      }

      if (!data) {
        const { data: current } = await client
          .from("profile_activities")
          .select("id")
          .eq("id", presentationId)
          .maybeSingle();

        if (current) {
          throw new Error("THIS PRESENTATION CHANGED ELSEWHERE");
        }

        throw new Error("THIS PRESENTATION IS NOT AVAILABLE");
      }

      return databaseToPresentation(data);
    },

    async deletePresentation(id) {
      const { data, error } = await client.rpc(
        "soft_delete_profile_activity",
        { target_activity_id: requireId(id) }
      );

      requireResult(error, data, "PRESENTATION COULD NOT BE DELETED");
    }
  });
}

export function selectPresentationRepository(runtime) {
  if (
    runtime.mode === FRONTEND_MODES.SUPABASE &&
    runtime.client
  ) {
    return createSupabasePresentationRepository(runtime.client);
  }

  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return createUnavailableRepository();
  }

  throw new Error("Presentation repository mode is invalid.");
}

export async function getPresentationRepository() {
  const runtime = await getFrontendRuntime();

  return Object.freeze({
    runtime,
    repository: selectPresentationRepository(runtime)
  });
}
