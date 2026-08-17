import { databaseImageToClient, databaseToWork, formToDatabase, isValidWorkId, mapPublicArtworkRows, PUBLIC_IMAGE_SELECT, WORK_SELECT } from "./work-mapping.mjs";
import { sanitizeWorkError, WorkError, WORK_ERROR_CODES } from "./work-errors.mjs";
import { createWorkMediaService } from "./work-media-service.mjs";

function requireId(id) {
  if (!isValidWorkId(id)) throw new WorkError(WORK_ERROR_CODES.INVALID, "THIS WORK IS NOT AVAILABLE");
  return id;
}

function requireResult(error, data, fallback) {
  if (error) throw sanitizeWorkError(error, fallback);
  return data;
}

async function anonymousRest(config, table, query) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: config.supabaseKey, Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw sanitizeWorkError({ status: response.status });
  return response.json();
}

export function createSupabaseWorkRepository(client, config) {
  const media = createWorkMediaService(client, config);

  async function listImages(workId) {
    const { data, error } = await client.rpc("list_managed_work_images", { target_work_id: requireId(workId) });
    return requireResult(error, data, "WORK IMAGES ARE UNAVAILABLE").map(databaseImageToClient);
  }

  async function attachImages(rows) {
    const all = await Promise.all(rows.map(async (row) => databaseToWork(row, await listImages(row.id))));
    return all;
  }

  return Object.freeze({
    mode: "supabase",
    media,
    initialise: async () => {},
    async listManagedProfiles() {
      const { data, error } = await client.rpc("list_manageable_artist_profiles");
      return requireResult(error, data, "ARTIST PROFILES ARE UNAVAILABLE").map((row) => Object.freeze({ id: row.id, name: row.display_name, slug: row.slug, publicationStatus: row.publication_status }));
    },
    async listWorks(profileIds = []) {
      if (!profileIds.length) return [];
      const { data, error } = await client.from("works").select(WORK_SELECT).in("owner_profile_id", profileIds).order("year_sort", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false }).order("id", { ascending: true });
      return attachImages(requireResult(error, data, "WORKS ARE UNAVAILABLE"));
    },
    async getWork(id) {
      const { data, error } = await client.from("works").select(WORK_SELECT).eq("id", requireId(id)).maybeSingle();
      if (error) throw sanitizeWorkError(error);
      return data ? databaseToWork(data, await listImages(id)) : null;
    },
    async createWork(record, ownerProfileId) {
      requireId(ownerProfileId);
      const payload = { owner_profile_id: ownerProfileId, ...formToDatabase(record) };
      const { data, error } = await client.from("works").insert(payload).select(WORK_SELECT).single();
      return databaseToWork(requireResult(error, data, "WORK COULD NOT BE SAVED"), []);
    },
    async updateWork(record, expectedUpdatedAt) {
      requireId(record.id);
      const query = client.from("works").update(formToDatabase(record)).eq("id", record.id).eq("updated_at", expectedUpdatedAt).select(WORK_SELECT).maybeSingle();
      const { data, error } = await query;
      if (error) throw sanitizeWorkError(error, "WORK COULD NOT BE SAVED");
      if (!data) {
        const { data: current } = await client.from("works").select("id").eq("id", record.id).maybeSingle();
        if (current) throw new WorkError(WORK_ERROR_CODES.CONFLICT, "THIS WORK CHANGED ELSEWHERE");
        throw new WorkError(WORK_ERROR_CODES.NOT_FOUND, "THIS WORK IS NOT AVAILABLE");
      }
      return databaseToWork(data, await listImages(record.id));
    },
    async reorderImages(workId, imageIds, coverImageId) {
      const { error } = await client.rpc("reorder_work_images", { target_work_id: requireId(workId), ordered_image_ids: imageIds, cover_image_id: coverImageId });
      if (error) throw sanitizeWorkError(error, "IMAGE ORDER COULD NOT BE SAVED");
      return listImages(workId);
    },
    async deleteWork(id) {
      const { data, error } = await client.rpc("soft_delete_work", { target_work_id: requireId(id) });
      requireResult(error, data, "WORK COULD NOT BE DELETED");
    },
    async getPublishedWork(id) {
      requireId(id);
      const workQuery = new URLSearchParams({ select: WORK_SELECT, id: `eq.${id}`, visibility: "eq.published", limit: "1" });
      const works = await anonymousRest(config, "works", workQuery);
      if (!works[0]) return null;
      const profileQuery = new URLSearchParams({ select: "id,display_name,slug,publication_status", id: `eq.${works[0].owner_profile_id}`, publication_status: "eq.published", limit: "1" });
      const profiles = await anonymousRest(config, "public_profiles", profileQuery);
      if (!profiles[0]) return null;
      const imageQuery = new URLSearchParams({ select: PUBLIC_IMAGE_SELECT, work_id: `eq.${id}`, public_object_path: "not.is.null", order: "sort_order.asc,id.asc" });
      const rows = await anonymousRest(config, "work_images", imageQuery);
      return mapPublicArtworkRows(works, profiles, rows, (path) => media.publicUrl(path));
    }
  });
}
