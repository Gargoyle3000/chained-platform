import test from "node:test";
import assert from "node:assert/strict";

import {
  DISCOVER_CANDIDATE_LIMIT,
  createDiscoverRepository
} from "../data/discover-repository.mjs";

const IDS = Object.freeze({
  artistA: "11111111-1111-4111-8111-111111111111",
  artistB: "22222222-2222-4222-8222-222222222222",
  workA1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  workA2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  workB1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"
});

function work(id, ownerProfileId, publishedAt, formatDiscipline) {
  return {
    id,
    owner_profile_id: ownerProfileId,
    title: `WORK ${id.at(-1)}`,
    year_label: "2026",
    format_discipline: formatDiscipline,
    visibility: "published",
    published_at: publishedAt
  };
}

function profile(id, slug) {
  return {
    id,
    profile_type: "artist",
    slug,
    display_name: slug.toUpperCase(),
    publication_status: "published"
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

const works = [
  work(IDS.workA1, IDS.artistA, "2026-08-03T00:00:00Z", "painting"),
  work(IDS.workA2, IDS.artistA, "2026-08-01T00:00:00Z", "painting"),
  work(IDS.workB1, IDS.artistB, "2026-08-02T00:00:00Z", "sculpture")
];
const profiles = [profile(IDS.artistA, "artist-a"), profile(IDS.artistB, "artist-b")];
const covers = works.map((entry) => cover(entry.id));

function repositoryWithCalls() {
  const calls = [];
  const request = async (_config, table, query) => {
    calls.push({ table, query: new URLSearchParams(query) });
    if (table === "works") {
      const constraint = query.get("format_discipline");
      if (!constraint) return works;
      const formats = constraint.slice(4, -1).split(",");
      return works.filter((entry) => formats.includes(entry.format_discipline));
    }
    if (table === "public_profiles") return profiles;
    if (table === "work_images") return covers;
    throw new Error(`Unexpected table: ${table}`);
  };
  const client = {
    storage: {
      from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://example.test/${path}` } }) })
    }
  };
  return {
    calls,
    repository: createDiscoverRepository(client, { supabaseUrl: "https://example.test" }, request)
  };
}

test("no Discover filter preserves the unfiltered bounded candidate query", async () => {
  const { repository, calls } = repositoryWithCalls();
  const result = await repository.listWorks();

  assert.equal(calls.length, 3);
  assert.equal(calls[0].table, "works");
  assert.equal(calls[0].query.get("format_discipline"), null);
  assert.equal(calls[0].query.get("limit"), String(DISCOVER_CANDIDATE_LIMIT));
  assert.deepEqual(result.map((entry) => entry.id), [IDS.workA1, IDS.workB1, IDS.workA2]);
});

test("clearing a Discover filter returns to the original unfiltered request", async () => {
  const { repository, calls } = repositoryWithCalls();
  await repository.listWorks({ formatDisciplines: ["sculpture"] });
  await repository.listWorks();

  const workQueries = calls.filter((call) => call.table === "works");
  assert.equal(workQueries.length, 2);
  assert.equal(workQueries[0].query.get("format_discipline"), "in.(sculpture)");
  assert.equal(workQueries[1].query.get("format_discipline"), null);
});

test("one discipline constrains the Works candidate query before its limit", async () => {
  const { repository, calls } = repositoryWithCalls();
  const result = await repository.listWorks({ formatDisciplines: ["painting"] });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].table, "works");
  assert.equal(calls[0].query.get("format_discipline"), "in.(painting)");
  assert.equal(calls[0].query.get("limit"), String(DISCOVER_CANDIDATE_LIMIT));
  assert.deepEqual(result.map((entry) => entry.id), [IDS.workA1, IDS.workA2]);
});

test("multiple Discover disciplines use one canonical OR candidate constraint", async () => {
  const { repository, calls } = repositoryWithCalls();
  const result = await repository.listWorks({ formatDisciplines: ["sculpture", "painting"] });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].query.get("format_discipline"), "in.(painting,sculpture)");
  assert.equal(calls.filter((call) => call.table === "works").length, 1);
  assert.deepEqual(result.map((entry) => entry.id), [IDS.workA1, IDS.workB1, IDS.workA2]);
});

test("an empty filtered candidate response stays empty without unrelated Works", async () => {
  const { repository, calls } = repositoryWithCalls();
  const result = await repository.listWorks({ formatDisciplines: ["publication"] });

  assert.deepEqual(result, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query.get("format_discipline"), "in.(publication)");
});

test("invalid or noncanonical disciplines fail before any public query", async () => {
  const { repository, calls } = repositoryWithCalls();

  await assert.rejects(
    () => repository.listWorks({ formatDisciplines: ["PAINTING"] }),
    /INVALID FORMAT DISCIPLINE/
  );
  assert.equal(calls.length, 0);
});
