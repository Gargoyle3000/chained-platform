import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { createPublicImageUrl, requestPublicRows } from "./public-data-request.mjs";
import {
  isValidPublicWorkId,
  mapDiscoverResult,
  PUBLIC_COVER_SELECT,
  PUBLIC_PROFILE_SELECT,
  PUBLIC_WORK_SELECT
} from "./public-work-mapping.mjs";

export const ARCHIVE_DATA_SOURCE = "supabase-only";

function archiveError() {
  return new Error("ARCHIVE IS CURRENTLY UNAVAILABLE");
}

function validWorkIds(values) {
  return [...new Set((values || []).filter(isValidPublicWorkId))];
}

function inFilter(ids) {
  return `in.(${ids.join(",")})`;
}

async function publicArchivedWorks(client, config, workIds, request) {
  if (!workIds.length) return [];

  const works = await request(config, "works", new URLSearchParams({
    select: PUBLIC_WORK_SELECT,
    id: inFilter(workIds),
    visibility: "eq.published",
    order: "published_at.desc,id.asc"
  }));

  const profileIds = validWorkIds(works.map((work) => work?.owner_profile_id));
  if (!profileIds.length) return [];

  const [profiles, covers] = await Promise.all([
    request(config, "public_profiles", new URLSearchParams({
      select: PUBLIC_PROFILE_SELECT,
      id: inFilter(profileIds),
      profile_type: "eq.artist",
      publication_status: "eq.published"
    })),
    request(config, "work_images", new URLSearchParams({
      select: PUBLIC_COVER_SELECT,
      work_id: inFilter(workIds),
      is_cover: "eq.true",
      public_object_path: "not.is.null",
      order: "id.asc"
    }))
  ]);

  return mapDiscoverResult(
    works,
    profiles,
    covers,
    (path) => createPublicImageUrl(client, path)
  );
}

export function createArchiveRepository(client, config, request = requestPublicRows) {
  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,

    async listArchivedWorks() {
      const { data, error } = await client
        .from("archive_items")
        .select("work_id,created_at")
        .order("created_at", { ascending: false })
        .order("work_id", { ascending: true });
      if (error) throw archiveError();

      const items = Array.isArray(data) ? data : [];
      const workIds = validWorkIds(items.map((item) => item?.work_id));
      const mapped = await publicArchivedWorks(client, config, workIds, request);
      const archiveOrder = new Map(workIds.map((id, index) => [id, index]));

      return Object.freeze(
        mapped
          .map((work) => Object.freeze({
            ...work,
            archivedAt: items.find((item) => item.work_id === work.id)?.created_at || null
          }))
          .sort((first, second) => archiveOrder.get(first.id) - archiveOrder.get(second.id))
      );
    },

    async saveWork(workId) {
      if (!isValidPublicWorkId(workId)) throw archiveError();
      const { error } = await client
        .from("archive_items")
        .insert({ work_id: workId });
      if (error) throw archiveError();
    },

    async removeWork(workId) {
      if (!isValidPublicWorkId(workId)) throw archiveError();
      const { error } = await client
        .from("archive_items")
        .delete()
        .eq("work_id", workId);
      if (error) throw archiveError();
    }
  });
}

export async function getArchiveRepository() {
  const runtime = await getFrontendRuntime();
  return resolveArchiveRepository(runtime);
}

export function resolveArchiveRepository(runtime) {
  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    return Object.freeze({ runtime, repository: null });
  }

  return Object.freeze({
    runtime,
    repository: createArchiveRepository(runtime.client, runtime.config)
  });
}
