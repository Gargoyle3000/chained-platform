import test from "node:test";
import assert from "node:assert/strict";
import { createCuratedRepository } from "../data/curated-repository.mjs";

const IDS = Object.freeze({
  collection: "11111111-1111-4111-8111-111111111111",
  publisher: "22222222-2222-4222-8222-222222222222",
  artist: "33333333-3333-4333-8333-333333333333",
  workA: "44444444-4444-4444-8444-444444444444",
  workB: "55555555-5555-4555-8555-555555555555"
});

function work(id, title) {
  return { id, owner_profile_id: IDS.artist, title, year_label: "2026", work_type: "single-work", format_discipline: "painting", visibility: "published", published_at: "2026-08-10T00:00:00Z" };
}

test("public CURATED mapping uses one ordered membership RPC and bounded public Work batches", async () => {
  const calls = [];
  const request = async (_config, table, query) => {
    calls.push({ table, query: new URLSearchParams(query) });
    if (table === "curated_collections") return [{ id: IDS.collection, publisher_profile_id: IDS.publisher, title: "Sequence", description: "A private Project made public.", status: "published", published_at: "2026-08-10T00:00:00Z" }];
    if (table === "public_profiles") {
      const ids = query.get("id");
      if (ids.includes(IDS.publisher)) return [{ id: IDS.publisher, profile_type: "curator", slug: "curator", display_name: "CURATOR", publication_status: "published" }];
      return [{ id: IDS.artist, profile_type: "artist", slug: "artist", display_name: "ARTIST", publication_status: "published" }];
    }
    if (table === "works") return [work(IDS.workA, "FIRST"), work(IDS.workB, "SECOND")];
    if (table === "work_images") return [
      { id: "66666666-6666-4666-8666-666666666666", work_id: IDS.workA, public_object_path: "a.webp", pixel_width: 800, pixel_height: 1000, is_cover: true },
      { id: "77777777-7777-4777-8777-777777777777", work_id: IDS.workB, public_object_path: "b.webp", pixel_width: 800, pixel_height: 1000, is_cover: true }
    ];
    throw new Error(`Unexpected ${table}`);
  };
  const client = {
    storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://example.test/${path}` } }) }) },
    async rpc(name, args) {
      calls.push({ rpc: [name, args] });
      return { data: [
        { collection_id: IDS.collection, work_id: IDS.workB, item_position: 1 },
        { collection_id: IDS.collection, work_id: IDS.workA, item_position: 0 },
        { collection_id: IDS.collection, work_id: "not-a-work", item_position: 2 }
      ], error: null };
    }
  };
  const collections = await createCuratedRepository(client, {}, request).listCollections();
  assert.deepEqual(collections.map((collection) => collection.works.map((entry) => entry.id)), [[IDS.workA, IDS.workB]]);
  assert.equal(Object.hasOwn(collections[0].publisher, "href"), false);
  assert.equal(calls.filter((call) => call.rpc).length, 1);
  assert.equal(calls.filter((call) => call.table === "works").length, 1);
  assert.equal(calls.filter((call) => call.table === "work_images").length, 1);
  assert.equal(calls[0].query.get("order"), "published_at.desc,id.asc");
});

test("a public collection with no currently eligible Work does not leak a private Work", async () => {
  const request = async (_config, table) => {
    if (table === "curated_collections") return [{ id: IDS.collection, publisher_profile_id: IDS.publisher, title: "Sequence", status: "published", published_at: "2026-08-10T00:00:00Z" }];
    if (table === "public_profiles") return [{ id: IDS.publisher, profile_type: "institution", slug: "institution", display_name: "INSTITUTION", publication_status: "published" }];
    if (table === "works") return [];
    throw new Error(`Unexpected ${table}`);
  };
  const client = {
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: null } }) }) },
    async rpc() { return { data: [{ collection_id: IDS.collection, work_id: IDS.workA, item_position: 0 }], error: null }; }
  };
  const [collection] = await createCuratedRepository(client, {}, request).listCollections();
  assert.deepEqual(collection.works, []);
});
