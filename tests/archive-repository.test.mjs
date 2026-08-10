import test from "node:test";
import assert from "node:assert/strict";

import { FRONTEND_MODES } from "../auth/config.mjs";
import {
  ARCHIVE_DATA_SOURCE,
  createArchiveRepository,
  resolveArchiveRepository
} from "../data/archive-repository.mjs";

const IDS = Object.freeze({
  profile: "11111111-1111-4111-8111-111111111111",
  workA: "22222222-2222-4222-8222-222222222222",
  workB: "33333333-3333-4333-8333-333333333333"
});

const config = Object.freeze({
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseKey: "public-test-key"
});

function publicUrl(path) {
  return path ? `http://127.0.0.1:54321/storage/v1/object/public/work-public/${path}` : null;
}

function archiveClient(items = [], failures = {}) {
  const calls = [];
  const client = {
    calls,
    storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: publicUrl(path) } }) }) },
    from(table) {
      assert.equal(table, "archive_items");
      return {
        select() {
          calls.push("select");
          const builder = {
            order() { return builder; },
            then(resolve) { resolve({ data: failures.list ? null : items, error: failures.list ? { message: "private database message" } : null }); }
          };
          return builder;
        },
        async insert(payload) {
          calls.push({ insert: payload });
          return { error: failures.save ? { message: "private database message" } : null };
        },
        delete() {
          calls.push("delete");
          return {
            eq(column, value) {
              calls.push({ eq: [column, value] });
              return Promise.resolve({ error: failures.remove ? { message: "private database message" } : null });
            }
          };
        }
      };
    }
  };
  return client;
}

function work(id, overrides = {}) {
  return {
    id,
    owner_profile_id: IDS.profile,
    title: `WORK ${id.at(-1)}`,
    year_sort: 2026,
    year_label: "2026",
    work_type: "painting",
    visibility: "published",
    published_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...overrides
  };
}

function profile() {
  return {
    id: IDS.profile,
    profile_type: "artist",
    slug: "archive-artist",
    display_name: "ARCHIVE ARTIST",
    publication_status: "published",
    published_at: "2026-08-10T00:00:00Z"
  };
}

function cover(workId) {
  return {
    id: workId.replace(/.$/, "f"),
    work_id: workId,
    public_object_path: `public/${workId}.webp`,
    pixel_width: 800,
    pixel_height: 1200,
    is_cover: true
  };
}

test("Archive repository is Supabase-only and prototype mode makes no query", () => {
  const resolved = resolveArchiveRepository({ mode: FRONTEND_MODES.PROTOTYPE });
  assert.equal(resolved.repository, null);
  assert.equal(ARCHIVE_DATA_SOURCE, "supabase-only");
});

test("a new Archive lists as genuinely empty without public-data requests", async () => {
  const client = archiveClient();
  let requests = 0;
  const repository = createArchiveRepository(client, config, async () => { requests += 1; return []; });
  assert.deepEqual(await repository.listArchivedWorks(), []);
  assert.deepEqual(client.calls, ["select"]);
  assert.equal(requests, 0);
});

test("Archive Work IDs use one private query and never request public metadata", async () => {
  const client = archiveClient([
    { work_id: IDS.workB },
    { work_id: IDS.workA },
    { work_id: "not-a-work" }
  ]);
  let requests = 0;
  const repository = createArchiveRepository(client, config, async () => { requests += 1; return []; });
  assert.deepEqual(await repository.listArchivedWorkIds(), [IDS.workB, IDS.workA]);
  assert.deepEqual(client.calls, ["select"]);
  assert.equal(requests, 0);
});

test("Archive listing preserves private save order and maps only public Work fields", async () => {
  const client = archiveClient([
    { work_id: IDS.workB, created_at: "2026-08-10T12:00:00Z" },
    { work_id: IDS.workA, created_at: "2026-08-10T11:00:00Z" }
  ]);
  const rows = new Map([
    ["works", [work(IDS.workA), work(IDS.workB)]],
    ["public_profiles", [profile()]],
    ["work_images", [cover(IDS.workA), cover(IDS.workB)]]
  ]);
  const repository = createArchiveRepository(client, config, async (_config, table) => rows.get(table));
  const listed = await repository.listArchivedWorks();
  assert.deepEqual(listed.map((entry) => entry.id), [IDS.workB, IDS.workA]);
  assert.equal(listed[0].archivedAt, "2026-08-10T12:00:00Z");
  assert.equal(JSON.stringify(listed).includes("private_object_path"), false);
});

test("unavailable public mappings are omitted while their private Archive relationship stays private", async () => {
  const client = archiveClient([{ work_id: IDS.workA, created_at: "2026-08-10T12:00:00Z" }]);
  const repository = createArchiveRepository(client, config, async (_config, table) => ({
    works: [work(IDS.workA)],
    public_profiles: [profile()],
    work_images: []
  })[table]);
  assert.deepEqual(await repository.listArchivedWorks(), []);
});

test("save and remove send only the Work identity and sanitize failures", async () => {
  const client = archiveClient();
  const repository = createArchiveRepository(client, config);
  await repository.saveWork(IDS.workA);
  await repository.removeWork(IDS.workA);
  assert.deepEqual(client.calls, [
    { insert: { work_id: IDS.workA } },
    "delete",
    { eq: ["work_id", IDS.workA] }
  ]);

  const failing = createArchiveRepository(archiveClient([], { save: true, remove: true }), config);
  await assert.rejects(() => failing.saveWork(IDS.workA), /ARCHIVE IS CURRENTLY UNAVAILABLE/);
  await assert.rejects(() => failing.removeWork(IDS.workA), /ARCHIVE IS CURRENTLY UNAVAILABLE/);
});

test("invalid work identities do not reach Archive mutations", async () => {
  const client = archiveClient();
  const repository = createArchiveRepository(client, config);
  await assert.rejects(() => repository.saveWork("not-a-work"), /ARCHIVE IS CURRENTLY UNAVAILABLE/);
  await assert.rejects(() => repository.removeWork("not-a-work"), /ARCHIVE IS CURRENTLY UNAVAILABLE/);
  assert.deepEqual(client.calls, []);
});
