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

function inFilter(ids) {
  return `in.(${ids.join(",")})`;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function collectionError() {
  return new Error("CURATED IS CURRENTLY UNAVAILABLE");
}

function mapCollection(row, publishers) {
  const publisher = publishers.get(row?.publisher_profile_id);
  if (!isValidPublicWorkId(row?.id) || !publisher || row.status !== "published" || !row.published_at) return null;
  const title = cleanText(row.title);
  if (!title) return null;
  return Object.freeze({
    id: row.id,
    title,
    description: cleanText(row.description),
    publishedAt: row.published_at,
    publisher,
    works: Object.freeze([])
  });
}

function mapPublisher(row) {
  const name = cleanText(row?.display_name);
  if (
    !isValidPublicWorkId(row?.id) ||
    !name ||
    !["curator", "institution"].includes(row.profile_type) ||
    row.publication_status !== "published"
  ) return null;
  return Object.freeze({
    id: row.id,
    name,
    slug: typeof row.slug === "string" ? row.slug : "",
    type: row.profile_type
  });
}

async function mapCollectionWorks(client, config, membershipRows, request) {
  const workIds = [...new Set(membershipRows.map((row) => row.work_id).filter(isValidPublicWorkId))];
  if (!workIds.length) return new Map();
  const works = await request(config, "works", new URLSearchParams({
    select: PUBLIC_WORK_SELECT,
    id: inFilter(workIds),
    visibility: "eq.published",
    order: "published_at.desc,id.asc"
  }));
  const ownerIds = [...new Set(works.map((work) => work?.owner_profile_id).filter(isValidPublicWorkId))];
  if (!ownerIds.length) return new Map();
  const [profiles, covers] = await Promise.all([
    request(config, "public_profiles", new URLSearchParams({
      select: PUBLIC_PROFILE_SELECT,
      id: inFilter(ownerIds),
      profile_type: "eq.artist",
      publication_status: "eq.published",
      order: "id.asc"
    })),
    request(config, "work_images", new URLSearchParams({
      select: PUBLIC_COVER_SELECT,
      work_id: inFilter(workIds),
      is_cover: "eq.true",
      public_object_path: "not.is.null",
      order: "work_id.asc,id.asc"
    }))
  ]);
  return new Map(mapDiscoverResult(
    works,
    profiles,
    covers,
    (path) => createPublicImageUrl(client, path)
  ).map((work) => [work.id, work]));
}

async function listCollectionItems(client, collectionIds) {
  if (!collectionIds.length) return [];
  const { data, error } = await client.rpc("list_published_curated_collection_items", {
    target_collection_ids: collectionIds
  });
  if (error || !Array.isArray(data)) throw collectionError();
  return data
    .filter((row) => (
      isValidPublicWorkId(row?.collection_id) &&
      isValidPublicWorkId(row?.work_id) &&
      Number.isInteger(Number(row?.item_position)) && Number(row.item_position) >= 0
    ))
    .sort((first, second) => (
      String(first.collection_id).localeCompare(String(second.collection_id), "en") ||
      Number(first.item_position) - Number(second.item_position) ||
      String(first.work_id).localeCompare(String(second.work_id), "en")
    ));
}

export function createCuratedRepository(client, config, request = requestPublicRows) {
  async function loadCollections(collectionId = null) {
    const collectionQuery = new URLSearchParams({
      select: "id,publisher_profile_id,title,description,status,published_at",
      status: "eq.published",
      order: "published_at.desc,id.asc"
    });
    if (collectionId) collectionQuery.set("id", `eq.${collectionId}`);
    const rows = await request(config, "curated_collections", collectionQuery);
    const publisherIds = [...new Set(rows.map((row) => row?.publisher_profile_id).filter(isValidPublicWorkId))];
    if (!publisherIds.length) return [];
    const publisherRows = await request(config, "public_profiles", new URLSearchParams({
      select: "id,profile_type,slug,display_name,publication_status",
      id: inFilter(publisherIds),
      publication_status: "eq.published",
      order: "id.asc"
    }));
    const publishers = new Map(publisherRows.map(mapPublisher).filter(Boolean).map((publisher) => [publisher.id, publisher]));
    const collections = rows.map((row) => mapCollection(row, publishers)).filter(Boolean);
    if (!collections.length) return [];
    const memberships = await listCollectionItems(client, collections.map((collection) => collection.id));
    const worksById = await mapCollectionWorks(client, config, memberships, request);
    const membershipsByCollection = new Map();
    memberships.forEach((membership) => {
      if (!membershipsByCollection.has(membership.collection_id)) membershipsByCollection.set(membership.collection_id, []);
      membershipsByCollection.get(membership.collection_id).push(membership);
    });
    return collections.map((collection) => Object.freeze({
      ...collection,
      works: Object.freeze((membershipsByCollection.get(collection.id) || [])
        .map((membership) => worksById.get(membership.work_id))
        .filter(Boolean))
    }));
  }

  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,
    async listCollections() {
      try { return Object.freeze(await loadCollections()); } catch { throw collectionError(); }
    },
    async getCollection(id) {
      if (!isValidPublicWorkId(id)) return null;
      try { return (await loadCollections(id))[0] || null; } catch { throw collectionError(); }
    }
  });
}

export async function getCuratedRepository() {
  const runtime = await getFrontendRuntime();
  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) return Object.freeze({ runtime, repository: null });
  return Object.freeze({ runtime, repository: createCuratedRepository(runtime.client, runtime.config) });
}
