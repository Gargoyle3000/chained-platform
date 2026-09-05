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
import { derivativeLargePublicPath } from "./work-mapping.mjs";

export const ARCHIVE_DATA_SOURCE = "supabase-only";

function archiveError() {
  return new Error("ARCHIVE IS CURRENTLY UNAVAILABLE");
}

function validWorkIds(values) {
  return [...new Set((values || []).filter(isValidPublicWorkId))];
}

function normalizeTagName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name.length > 0 && name.length <= 80 ? name : null;
}

function normalizeProjectTitle(value) {
  const title = typeof value === "string" ? value.trim() : "";
  return title.length > 0 && title.length <= 160 ? title : null;
}

function normalizeProjectDescription(value) {
  const description = typeof value === "string" ? value.trim() : "";
  return description.length <= 2000 ? description || null : null;
}

function mapProject(row) {
  const title = normalizeProjectTitle(row?.title);
  if (!isValidPublicWorkId(row?.id) || !title) return null;

  return Object.freeze({
    id: row.id,
    title,
    description: normalizeProjectDescription(row.description),
    publisherProfileId: isValidPublicWorkId(row.publisher_profile_id)
      ? row.publisher_profile_id
      : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  });
}

function mapProjectItem(row) {
  if (!isValidPublicWorkId(row?.project_id) || !isValidPublicWorkId(row?.work_id)) return null;
  const position = Number(row.position);
  if (!Number.isInteger(position) || position < 0) return null;

  return Object.freeze({
    projectId: row.project_id,
    workId: row.work_id,
    position,
    addedAt: row.added_at || null
  });
}

function mapPublisherProfile(row) {
  const displayName = typeof row?.display_name === "string" ? row.display_name.trim() : "";
  if (!isValidPublicWorkId(row?.id) || !displayName || !["curator", "institution"].includes(row.profile_type)) {
    return null;
  }

  return Object.freeze({
    id: row.id,
    displayName,
    slug: typeof row.slug === "string" ? row.slug : "",
    profileType: row.profile_type
  });
}

function mapProjectPublication(row) {
  if (!isValidPublicWorkId(row?.project_id) || !isValidPublicWorkId(row?.id)) return null;
  if (!["draft", "published"].includes(row.status)) return null;
  return Object.freeze({
    id: row.id,
    projectId: row.project_id,
    publisherProfileId: isValidPublicWorkId(row.publisher_profile_id) ? row.publisher_profile_id : null,
    status: row.status,
    publishedAt: row.published_at || null
  });
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

const PUBLIC_SELECT_IMAGE_SELECT = [
  "id",
  "work_id",
  "public_object_path",
  "pixel_width",
  "pixel_height",
  "sort_order",
  "is_cover"
].join(",");

function selectImagesForWork(rows, workId, client) {
  const sourceRows = [...(rows || [])].filter((row) => row?.work_id === workId && typeof row.public_object_path === "string");
  if (!sourceRows.length) return null;
  const images = sourceRows
    .map((row) => {
      const largePath = derivativeLargePublicPath(row.public_object_path, row.id);
      const src = largePath ? createPublicImageUrl(client, largePath) : null;
      if (!src) return null;
      return Object.freeze({
        id: row.id,
        src,
        width: Number(row.pixel_width) > 0 ? Number(row.pixel_width) : null,
        height: Number(row.pixel_height) > 0 ? Number(row.pixel_height) : null,
        order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        uploadStatus: "ready"
      });
    })
    .filter(Boolean)
    .sort((first, second) => first.order - second.order || first.id.localeCompare(second.id, "en"));
  return images.length === sourceRows.length ? Object.freeze(images) : null;
}

async function publicSelectWorks(client, config, workIds, request) {
  if (!workIds.length) return [];
  const works = await request(config, "works", new URLSearchParams({
    select: PUBLIC_WORK_SELECT,
    id: inFilter(workIds),
    visibility: "eq.published",
    order: "published_at.desc,id.asc"
  }));
  const profileIds = validWorkIds(works.map((work) => work?.owner_profile_id));
  if (!profileIds.length) return [];
  const [profiles, imageRows] = await Promise.all([
    request(config, "public_profiles", new URLSearchParams({
      select: PUBLIC_PROFILE_SELECT,
      id: inFilter(profileIds),
      profile_type: "eq.artist",
      publication_status: "eq.published"
    })),
    request(config, "work_images", new URLSearchParams({
      select: PUBLIC_SELECT_IMAGE_SELECT,
      work_id: inFilter(workIds),
      public_object_path: "not.is.null",
      order: "sort_order.asc,id.asc"
    }))
  ]);

  const publicWorks = mapDiscoverResult(works, profiles, imageRows, (path) => createPublicImageUrl(client, path));
  return publicWorks
    .map((work) => {
      const images = selectImagesForWork(imageRows, work.id, client);
      return images ? Object.freeze({ ...work, images }) : null;
    })
    .filter(Boolean);
}

export function createArchiveRepository(client, config, request = requestPublicRows) {
  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,

    async listArchivedWorkIds() {
      const { data, error } = await client
        .from("archive_items")
        .select("work_id");
      if (error) throw archiveError();

      return Object.freeze(validWorkIds((data || []).map((item) => item?.work_id)));
    },

    async listTags() {
      const { data, error } = await client
        .from("archive_tags")
        .select("id,name,created_at")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw archiveError();

      return Object.freeze(
        (Array.isArray(data) ? data : [])
          .filter((tag) => isValidPublicWorkId(tag?.id) && normalizeTagName(tag?.name))
          .map((tag) => Object.freeze({
            id: tag.id,
            name: normalizeTagName(tag.name),
            createdAt: tag.created_at || null
          }))
      );
    },

    async listTagMemberships() {
      const { data, error } = await client
        .from("archive_item_tags")
        .select("work_id,tag_id");
      if (error) throw archiveError();

      return Object.freeze(
        (Array.isArray(data) ? data : [])
          .filter((membership) => (
            isValidPublicWorkId(membership?.work_id) && isValidPublicWorkId(membership?.tag_id)
          ))
          .map((membership) => Object.freeze({
            workId: membership.work_id,
            tagId: membership.tag_id
          }))
      );
    },

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
    },

    async listArchivedSelectWorks(requestedWorkIds = []) {
      const { data, error } = await client
        .from("archive_items")
        .select("work_id")
        .order("created_at", { ascending: false })
        .order("work_id", { ascending: true });
      if (error) throw archiveError();

      const saved = validWorkIds((data || []).map((item) => item?.work_id));
      const savedSet = new Set(saved);
      const requested = validWorkIds(requestedWorkIds);
      const selected = (requested.length ? requested : saved).filter((id) => savedSet.has(id));
      const loaded = await publicSelectWorks(client, config, selected, request);
      const byId = new Map(loaded.map((work) => [work.id, work]));
      return Object.freeze(selected.map((id) => byId.get(id)).filter(Boolean));
    },

    async listProjects() {
      const { data, error } = await client
        .from("archive_projects")
        .select("id,title,description,publisher_profile_id,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true });
      if (error) throw archiveError();

      return Object.freeze((Array.isArray(data) ? data : []).map(mapProject).filter(Boolean));
    },

    async createProject(title, description = "") {
      const normalizedTitle = normalizeProjectTitle(title);
      const normalizedDescription = normalizeProjectDescription(description);
      if (!normalizedTitle || (typeof description === "string" && description.trim().length > 2000)) {
        throw archiveError();
      }
      const { data, error } = await client
        .from("archive_projects")
        .insert({ title: normalizedTitle, description: normalizedDescription })
        .select("id,title,description,publisher_profile_id,created_at,updated_at")
        .single();
      const project = mapProject(data);
      if (error || !project) throw archiveError();
      return project;
    },

    async updateProject(projectId, title, description = "") {
      const normalizedTitle = normalizeProjectTitle(title);
      const normalizedDescription = normalizeProjectDescription(description);
      if (!isValidPublicWorkId(projectId) || !normalizedTitle || (typeof description === "string" && description.trim().length > 2000)) {
        throw archiveError();
      }
      const { data, error } = await client
        .from("archive_projects")
        .update({ title: normalizedTitle, description: normalizedDescription })
        .eq("id", projectId)
        .select("id,title,description,publisher_profile_id,created_at,updated_at")
        .single();
      const project = mapProject(data);
      if (error || !project) throw archiveError();
      return project;
    },

    async deleteProject(projectId) {
      if (!isValidPublicWorkId(projectId)) throw archiveError();
      const { error } = await client
        .from("archive_projects")
        .delete()
        .eq("id", projectId);
      if (error) throw archiveError();
    },

    async listProjectItems() {
      const { data, error } = await client
        .from("archive_project_items")
        .select("project_id,work_id,position,added_at")
        .order("project_id", { ascending: true })
        .order("position", { ascending: true })
        .order("work_id", { ascending: true });
      if (error) throw archiveError();

      return Object.freeze((Array.isArray(data) ? data : []).map(mapProjectItem).filter(Boolean));
    },

    async listProjectPublications() {
      const { data, error } = await client
        .from("curated_collections")
        .select("id,project_id,publisher_profile_id,status,published_at");
      if (error) throw archiveError();
      return Object.freeze((Array.isArray(data) ? data : []).map(mapProjectPublication).filter(Boolean));
    },

    async addProjectWork(projectId, workId) {
      if (!isValidPublicWorkId(projectId) || !isValidPublicWorkId(workId)) throw archiveError();
      const { error } = await client.rpc("add_archive_project_item", {
        target_project_id: projectId,
        target_work_id: workId
      });
      if (error) throw archiveError();
    },

    async removeProjectWork(projectId, workId) {
      if (!isValidPublicWorkId(projectId) || !isValidPublicWorkId(workId)) throw archiveError();
      const { error } = await client.rpc("remove_archive_project_item", {
        target_project_id: projectId,
        target_work_id: workId
      });
      if (error) throw archiveError();
    },

    async reorderProjectWorks(projectId, orderedWorkIds) {
      const validIds = validWorkIds(orderedWorkIds);
      if (!isValidPublicWorkId(projectId) || validIds.length !== (orderedWorkIds || []).length) throw archiveError();
      const { error } = await client.rpc("reorder_archive_project_items", {
        target_project_id: projectId,
        ordered_work_ids: validIds
      });
      if (error) throw archiveError();
    },

    async listEligiblePublisherProfiles() {
      const { data, error } = await client.rpc("list_manageable_curated_publisher_profiles");
      if (error) throw archiveError();
      return Object.freeze((Array.isArray(data) ? data : []).map(mapPublisherProfile).filter(Boolean));
    },

    async publishProject(projectId, publisherProfileId) {
      if (!isValidPublicWorkId(projectId) || !isValidPublicWorkId(publisherProfileId)) throw archiveError();
      const { error } = await client.rpc("publish_archive_project", {
        target_project_id: projectId,
        target_publisher_profile_id: publisherProfileId
      });
      if (error) throw archiveError();
    },

    async depublishProject(projectId) {
      if (!isValidPublicWorkId(projectId)) throw archiveError();
      const { error } = await client.rpc("depublish_archive_project", {
        target_project_id: projectId
      });
      if (error) throw archiveError();
    },

    async createTag(name) {
      const normalizedName = normalizeTagName(name);
      if (!normalizedName) throw archiveError();

      const { error } = await client
        .from("archive_tags")
        .insert({ name: normalizedName });
      if (error) throw archiveError();
    },

    async deleteTag(tagId) {
      if (!isValidPublicWorkId(tagId)) throw archiveError();
      const { error } = await client
        .from("archive_tags")
        .delete()
        .eq("id", tagId);
      if (error) throw archiveError();
    },

    async assignTag(workId, tagId) {
      if (!isValidPublicWorkId(workId) || !isValidPublicWorkId(tagId)) throw archiveError();
      const { error } = await client
        .from("archive_item_tags")
        .insert({ work_id: workId, tag_id: tagId });
      if (error) throw archiveError();
    },

    async removeTag(workId, tagId) {
      if (!isValidPublicWorkId(workId) || !isValidPublicWorkId(tagId)) throw archiveError();
      const { error } = await client
        .from("archive_item_tags")
        .delete()
        .eq("work_id", workId)
        .eq("tag_id", tagId);
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
