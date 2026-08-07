import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_SELECT = [
  "id",
  "profile_id",
  "category_type",
  "label",
  "display_order",
  "is_visible",
  "created_at",
  "updated_at"
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
  "start_date",
  "end_date",
  "external_url",
  "visibility",
  "published_at",
  "deleted_at",
  "updated_at"
].join(",");

function requireId(id, message = "THIS CV RECORD IS NOT AVAILABLE") {
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

function cleanOrder(value) {
  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : 0;
}

function databaseToProfile(row) {
  return Object.freeze({
    id: row.id,
    name: row.display_name,
    slug: row.slug,
    publicationStatus: row.publication_status
  });
}

function databaseToCategory(row, entries = []) {
  return Object.freeze({
    id: row.id,
    profileId: row.profile_id,
    categoryType: row.category_type,
    label: row.label,
    displayOrder: row.display_order,
    isVisible: row.is_visible !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entries: Object.freeze(entries)
  });
}

function databaseToActivity(row) {
  if (!row) return null;

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
    externalUrl: row.external_url || "",
    visibility: row.visibility || "draft",
    publishedAt: row.published_at,
    deletedAt: row.deleted_at,
    updatedAt: row.updated_at
  });
}

function databaseToEntry(row, sourceActivity = null) {
  return Object.freeze({
    id: row.id,
    categoryId: row.category_id,
    sourceActivityId: row.source_activity_id,
    yearLabel: row.year_label || "",
    title: row.title || "",
    organization: row.organization || "",
    locationText: row.location_text || "",
    url: row.url || "",
    displayOrder: row.display_order,
    isVisible: row.is_visible !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isAutomatic: Boolean(row.source_activity_id),
    sourceActivity
  });
}

function categoryToDatabase(record) {
  return {
    category_type: String(record.categoryType ?? "").trim(),
    label: String(record.label ?? "").trim(),
    display_order: cleanOrder(record.displayOrder),
    is_visible: record.isVisible !== false
  };
}

function manualEntryToDatabase(record) {
  return {
    category_id: requireId(
      record.categoryId,
      "SELECT A CV CATEGORY"
    ),
    year_label: cleanText(record.yearLabel),
    title: String(record.title ?? "").trim(),
    organization: cleanText(record.organization),
    location_text: cleanText(record.locationText),
    url: cleanText(record.url),
    display_order: cleanOrder(record.displayOrder),
    is_visible: record.isVisible !== false
  };
}

function createUnavailableRepository() {
  const unavailable = () => {
    throw new Error("CV MANAGEMENT REQUIRES THE LOCAL DATABASE");
  };

  return Object.freeze({
    mode: "prototype",
    initialise: async () => {},
    listManagedProfiles: async () => [],
    listCategories: async () => [],
    listCv: async () => [],
    getEntry: async () => null,
    createCategory: unavailable,
    updateCategory: unavailable,
    createManualEntry: unavailable,
    updateManualEntry: unavailable,
    updateEntryVisibility: unavailable,
    deleteManualEntry: unavailable
  });
}

async function resolveActivities(client, activityIds) {
  if (!activityIds.length) return new Map();

  const { data, error } = await client
    .from("profile_activities")
    .select(ACTIVITY_SELECT)
    .in("id", activityIds);

  const rows = requireResult(
    error,
    data,
    "LINKED PRESENTATIONS ARE UNAVAILABLE"
  );

  return new Map(
    rows.map((row) => [
      row.id,
      databaseToActivity(row)
    ])
  );
}

async function ensureUpdatedRow({
  client,
  table,
  id,
  expectedUpdatedAt,
  payload,
  select,
  changedMessage,
  unavailableMessage,
  failureMessage
}) {
  let query = client
    .from(table)
    .update(payload)
    .eq("id", requireId(id))
    .select(select)
    .maybeSingle();

  if (expectedUpdatedAt) {
    query = client
      .from(table)
      .update(payload)
      .eq("id", requireId(id))
      .eq("updated_at", expectedUpdatedAt)
      .select(select)
      .maybeSingle();
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    throw new Error(failureMessage);
  }

  if (data) return data;

  const { data: current, error: currentError } = await client
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (currentError) {
    console.error(currentError);
    throw new Error(failureMessage);
  }

  if (current) {
    throw new Error(changedMessage);
  }

  throw new Error(unavailableMessage);
}

export function createSupabaseCvRepository(client) {
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
      ).map(databaseToProfile);
    },

    async listCategories(profileIds = []) {
      if (!profileIds.length) return [];

      const { data, error } = await client
        .from("cv_categories")
        .select(CATEGORY_SELECT)
        .in("profile_id", profileIds)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true });

      return requireResult(
        error,
        data,
        "CV CATEGORIES ARE UNAVAILABLE"
      ).map((row) => databaseToCategory(row));
    },

    async listCv(profileIds = []) {
      if (!profileIds.length) return [];

      const { data: categoryRows, error: categoryError } =
        await client
          .from("cv_categories")
          .select(CATEGORY_SELECT)
          .in("profile_id", profileIds)
          .order("display_order", { ascending: true })
          .order("id", { ascending: true });

      const categories = requireResult(
        categoryError,
        categoryRows,
        "CV CATEGORIES ARE UNAVAILABLE"
      );

      if (!categories.length) return [];

      const categoryIds =
        categories.map((category) => category.id);

      const { data: entryRows, error: entryError } =
        await client
          .from("cv_entries")
          .select(ENTRY_SELECT)
          .in("category_id", categoryIds)
          .order("display_order", { ascending: true })
          .order("id", { ascending: true });

      const entries = requireResult(
        entryError,
        entryRows,
        "CV ENTRIES ARE UNAVAILABLE"
      );

      const activityIds = [
        ...new Set(
          entries
            .map((entry) => entry.source_activity_id)
            .filter(Boolean)
        )
      ];

      const activities =
        await resolveActivities(client, activityIds);

      const entriesByCategory = new Map();

      entries.forEach((entry) => {
        const categoryEntries =
          entriesByCategory.get(entry.category_id) || [];

        categoryEntries.push(
          databaseToEntry(
            entry,
            activities.get(entry.source_activity_id) || null
          )
        );

        entriesByCategory.set(
          entry.category_id,
          categoryEntries
        );
      });

      return categories.map((category) =>
        databaseToCategory(
          category,
          entriesByCategory.get(category.id) || []
        )
      );
    },

    async getEntry(id) {
      const entryId = requireId(id);

      const { data: entryRow, error: entryError } =
        await client
          .from("cv_entries")
          .select(ENTRY_SELECT)
          .eq("id", entryId)
          .maybeSingle();

      const entry = requireResult(
        entryError,
        entryRow,
        "CV ENTRY IS UNAVAILABLE"
      );

      if (!entry) return null;

      const { data: categoryRow, error: categoryError } =
        await client
          .from("cv_categories")
          .select(CATEGORY_SELECT)
          .eq("id", entry.category_id)
          .maybeSingle();

      const category = requireResult(
        categoryError,
        categoryRow,
        "CV CATEGORY IS UNAVAILABLE"
      );

      if (!category) return null;

      let activity = null;

      if (entry.source_activity_id) {
        const activities = await resolveActivities(
          client,
          [entry.source_activity_id]
        );

        activity =
          activities.get(entry.source_activity_id) || null;
      }

      return Object.freeze({
        entry: databaseToEntry(entry, activity),
        category: databaseToCategory(category)
      });
    },

    async createCategory(record, ownerProfileId) {
      const payload = {
        profile_id: requireId(
          ownerProfileId,
          "ARTIST PROFILE IS UNAVAILABLE"
        ),
        ...categoryToDatabase(record)
      };

      const { data, error } = await client
        .from("cv_categories")
        .insert(payload)
        .select(CATEGORY_SELECT)
        .single();

      return databaseToCategory(
        requireResult(
          error,
          data,
          "CV CATEGORY COULD NOT BE CREATED"
        )
      );
    },

    async updateCategory(record, expectedUpdatedAt) {
      const row = await ensureUpdatedRow({
        client,
        table: "cv_categories",
        id: record.id,
        expectedUpdatedAt,
        payload: {
          label: String(record.label ?? "").trim(),
          display_order: cleanOrder(record.displayOrder),
          is_visible: record.isVisible !== false
        },
        select: CATEGORY_SELECT,
        changedMessage: "THIS CV CATEGORY CHANGED ELSEWHERE",
        unavailableMessage: "THIS CV CATEGORY IS NOT AVAILABLE",
        failureMessage: "CV CATEGORY COULD NOT BE SAVED"
      });

      return databaseToCategory(row);
    },

    async createManualEntry(record) {
      const { data, error } = await client
        .from("cv_entries")
        .insert(manualEntryToDatabase(record))
        .select(ENTRY_SELECT)
        .single();

      return databaseToEntry(
        requireResult(
          error,
          data,
          "CV ENTRY COULD NOT BE CREATED"
        )
      );
    },

    async updateManualEntry(record, expectedUpdatedAt) {
      if (record.sourceActivityId) {
        throw new Error(
          "AUTOMATIC CV ENTRIES ARE EDITED THROUGH PRESENTATIONS"
        );
      }

      const row = await ensureUpdatedRow({
        client,
        table: "cv_entries",
        id: record.id,
        expectedUpdatedAt,
        payload: manualEntryToDatabase(record),
        select: ENTRY_SELECT,
        changedMessage: "THIS CV ENTRY CHANGED ELSEWHERE",
        unavailableMessage: "THIS CV ENTRY IS NOT AVAILABLE",
        failureMessage: "CV ENTRY COULD NOT BE SAVED"
      });

      return databaseToEntry(row);
    },

    async updateEntryVisibility(
      id,
      isVisible,
      expectedUpdatedAt
    ) {
      const row = await ensureUpdatedRow({
        client,
        table: "cv_entries",
        id,
        expectedUpdatedAt,
        payload: {
          is_visible: Boolean(isVisible)
        },
        select: ENTRY_SELECT,
        changedMessage: "THIS CV ENTRY CHANGED ELSEWHERE",
        unavailableMessage: "THIS CV ENTRY IS NOT AVAILABLE",
        failureMessage: "CV VISIBILITY COULD NOT BE CHANGED"
      });

      return databaseToEntry(row);
    },

    async deleteManualEntry(id) {
      const entryId = requireId(id);

      const { data, error } = await client
        .from("cv_entries")
        .delete()
        .eq("id", entryId)
        .is("source_activity_id", null)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error(error);
        throw new Error("CV ENTRY COULD NOT BE DELETED");
      }

      if (data) return true;

      const { data: current, error: currentError } =
        await client
          .from("cv_entries")
          .select("id,source_activity_id")
          .eq("id", entryId)
          .maybeSingle();

      if (currentError) {
        console.error(currentError);
        throw new Error("CV ENTRY COULD NOT BE DELETED");
      }

      if (current?.source_activity_id) {
        throw new Error(
          "AUTOMATIC CV ENTRIES ARE REMOVED THROUGH PRESENTATIONS"
        );
      }

      throw new Error("THIS CV ENTRY IS NOT AVAILABLE");
    }
  });
}

export async function getCvRepository() {
  const runtime = await getFrontendRuntime();

  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return Object.freeze({
      runtime,
      repository: createUnavailableRepository()
    });
  }

  return Object.freeze({
    runtime,
    repository: createSupabaseCvRepository(runtime.client)
  });
}