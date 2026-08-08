import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";

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
  "created_at",
  "updated_at"
].join(",");

function requireId(
  id,
  message = "THIS PRESS ITEM IS NOT AVAILABLE"
) {
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

function normalizeUrl(value) {
  const cleaned = String(value ?? "").trim();

  if (!cleaned) return "";

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  return `https://${cleaned}`;
}

function databaseToProfile(row) {
  return Object.freeze({
    id: row.id,
    name: row.display_name,
    slug: row.slug,
    publicationStatus: row.publication_status
  });
}

function databaseToPressItem(row) {
  return Object.freeze({
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    yearLabel: row.year_label || "",
    title: row.title || "",
    author: row.author || "",
    body: row.body || "",
    url: row.url || "",
    isVisible: row.is_visible !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function pressItemToDatabase(record) {
  return {
    year_label: String(record.yearLabel ?? "").trim(),
    title: String(record.title ?? "").trim(),
    author: cleanText(record.author),
    body: cleanText(record.body),
    url: cleanText(normalizeUrl(record.url)),
    is_visible: record.isVisible !== false
  };
}

function validateRecord(record) {
  const year = String(record.yearLabel ?? "").trim();
  const title = String(record.title ?? "").trim();
  const url = normalizeUrl(record.url);

  if (!year) {
    throw new Error("YEAR IS REQUIRED");
  }

  if (!title) {
    throw new Error("TITLE IS REQUIRED");
  }

  if (
    url &&
    !/^https?:\/\//i.test(url)
  ) {
    throw new Error(
      "URL MUST START WITH HTTP:// OR HTTPS://"
    );
  }
}

async function ensureUpdatedRow({
  client,
  id,
  expectedUpdatedAt,
  payload,
  changedMessage,
  unavailableMessage,
  failureMessage
}) {
  let query = client
    .from("profile_press_items")
    .update(payload)
    .eq("id", requireId(id));

  if (expectedUpdatedAt) {
    query = query.eq(
      "updated_at",
      expectedUpdatedAt
    );
  }

  const { data, error } = await query
    .select(PRESS_SELECT)
    .maybeSingle();

  if (error) {
    console.error(error);
    throw new Error(failureMessage);
  }

  if (data) return data;

  const {
    data: current,
    error: currentError
  } = await client
    .from("profile_press_items")
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

function createUnavailableRepository() {
  const unavailable = () => {
    throw new Error(
      "PRESS MANAGEMENT REQUIRES THE LOCAL DATABASE"
    );
  };

  return Object.freeze({
    mode: "prototype",
    initialise: async () => {},
    listManagedProfiles: async () => [],
    listPressItems: async () => [],
    createPressItem: unavailable,
    updatePressItem: unavailable,
    updatePressVisibility: unavailable,
    deletePressItem: unavailable
  });
}

export function createSupabasePressRepository(client) {
  return Object.freeze({
    mode: "supabase",

    initialise: async () => {},

    async listManagedProfiles() {
      const { data, error } =
        await client.rpc(
          "list_manageable_artist_profiles"
        );

      return requireResult(
        error,
        data,
        "ARTIST PROFILES ARE UNAVAILABLE"
      ).map(databaseToProfile);
    },

    async listPressItems(profileIds = []) {
      if (!profileIds.length) return [];

      const { data, error } = await client
        .from("profile_press_items")
        .select(PRESS_SELECT)
        .in("owner_profile_id", profileIds)
        .order("created_at", {
          ascending: false
        })
        .order("id", {
          ascending: true
        });

      return requireResult(
        error,
        data,
        "PRESS ITEMS ARE UNAVAILABLE"
      ).map(databaseToPressItem);
    },

    async createPressItem(record, ownerProfileId) {
      validateRecord(record);

      const payload = {
        owner_profile_id: requireId(
          ownerProfileId,
          "ARTIST PROFILE IS UNAVAILABLE"
        ),
        ...pressItemToDatabase(record)
      };

      const { data, error } = await client
        .from("profile_press_items")
        .insert(payload)
        .select(PRESS_SELECT)
        .single();

      return databaseToPressItem(
        requireResult(
          error,
          data,
          "PRESS ITEM COULD NOT BE CREATED"
        )
      );
    },

    async updatePressItem(
      record,
      expectedUpdatedAt
    ) {
      validateRecord(record);

      const row = await ensureUpdatedRow({
        client,
        id: record.id,
        expectedUpdatedAt,
        payload: pressItemToDatabase(record),
        changedMessage:
          "THIS PRESS ITEM CHANGED ELSEWHERE",
        unavailableMessage:
          "THIS PRESS ITEM IS NOT AVAILABLE",
        failureMessage:
          "PRESS ITEM COULD NOT BE SAVED"
      });

      return databaseToPressItem(row);
    },

    async updatePressVisibility(
      id,
      isVisible,
      expectedUpdatedAt
    ) {
      const row = await ensureUpdatedRow({
        client,
        id,
        expectedUpdatedAt,
        payload: {
          is_visible: Boolean(isVisible)
        },
        changedMessage:
          "THIS PRESS ITEM CHANGED ELSEWHERE",
        unavailableMessage:
          "THIS PRESS ITEM IS NOT AVAILABLE",
        failureMessage:
          "PRESS VISIBILITY COULD NOT BE UPDATED"
      });

      return databaseToPressItem(row);
    },

    async deletePressItem(id) {
      const pressId = requireId(id);

      const { error } = await client
        .from("profile_press_items")
        .delete()
        .eq("id", pressId);

      if (error) {
        console.error(error);
        throw new Error(
          "PRESS ITEM COULD NOT BE DELETED"
        );
      }
    }
  });
}

export function selectPressRepository(runtime) {
  if (
    runtime.mode === FRONTEND_MODES.SUPABASE &&
    runtime.client
  ) {
    return createSupabasePressRepository(
      runtime.client
    );
  }

  if (
    runtime.mode === FRONTEND_MODES.PROTOTYPE
  ) {
    return createUnavailableRepository();
  }

  throw new Error(
    "Press repository mode is invalid."
  );
}

export async function getPressRepository() {
  const runtime = await getFrontendRuntime();

  return Object.freeze({
    runtime,
    repository:
      selectPressRepository(runtime)
  });
}