import test from "node:test";
import assert from "node:assert/strict";

import {
  createDiscoverBatchState,
  PREFERRED_ARTIST_GAP,
  spreadDiscoverWorks
} from "../data/discover-ordering.mjs";
import {
  createPublicArtworkLink,
  createPublicPresentationLink,
  createPublicProfileLink,
  DISCOVER_PROFILE_SELECT,
  DISCOVER_WORK_SELECT,
  isValidProfileSlug,
  isValidPublicProfileId,
  mapDiscoverResult,
  mapPublishedArtistProfile,
  mapPublicProfileResult,
  PUBLIC_COVER_SELECT,
  PUBLIC_PROFILE_SELECT,
  PUBLIC_WORK_SELECT
} from "../data/public-work-mapping.mjs";
import {
  PublicDataError,
  requestPublicRows
} from "../data/public-data-request.mjs";
import { createPublicProfileRepository } from "../data/public-profile-repository.mjs";

const IDS = Object.freeze({
  profileA: "11111111-1111-4111-8111-111111111111",
  profileB: "22222222-2222-4222-8222-222222222222",
  profileC: "33333333-3333-4333-8333-333333333333",
  profileD: "44444444-4444-4444-8444-444444444444",
  profileE: "55555555-5555-4555-8555-555555555555",
  workA1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  workA2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  workA3: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  workB1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  workB2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  workC1: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  workD1: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
  workE1: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1"
});

function profile(id = IDS.profileA, slug = "artist-a", overrides = {}) {
  return {
    id,
    profile_type: "artist",
    slug,
    display_name: slug.toUpperCase(),
    biography: "PUBLIC BIOGRAPHY",
    alternativeName: "",
    city: "",
    country: "",
    websiteUrl: "",
    socialUrl: "",
    pronouns: "",
    publicContactEmail: "",
    showWorks: true,
    showPresentations: true,
    showAgenda: true,
    showCv: true,
    showPress: true,
    publication_status: "published",
    published_at: "2026-08-01T00:00:00Z",
    ...overrides
  };
}

function work(id, ownerId, publishedAt, overrides = {}) {
  return {
    id,
    owner_profile_id: ownerId,
    title: `WORK ${id.at(-1)}`,
    year_sort: 2026,
    year_label: "2026",
    work_type: "painting",
    visibility: "published",
    published_at: publishedAt,
    updated_at: publishedAt,
    ...overrides
  };
}

function cover(workId, overrides = {}) {
  return {
    id: workId.replace(/.$/, "f"),
    work_id: workId,
    public_object_path: `public/${workId}.webp`,
    private_object_path: `private/${workId}.webp`,
    pixel_width: 800,
    pixel_height: 1200,
    is_cover: true,
    ...overrides
  };
}

function publicUrl(path) {
  return path ? `http://127.0.0.1:54321/storage/public/${encodeURIComponent(path)}` : null;
}

function item(id, artistKey, publishedAt, engagement = undefined) {
  return { id, artistKey, publishedAt, engagement };
}

test("profile slugs accept only normalized route values", () => {
  assert.equal(isValidProfileSlug("peer-vink"), true);
  assert.equal(isValidProfileSlug("Peer-Vink"), false);
  assert.equal(isValidProfileSlug(""), false);
  assert.equal(isValidProfileSlug("..%2fsecret"), false);
});

test("decoded traversal, protocol, and fragment-like slug values are rejected", () => {
  assert.equal(isValidProfileSlug(decodeURIComponent("%2e%2e%2fsecret")), false);
  assert.equal(isValidProfileSlug("https://example.test"), false);
  assert.equal(isValidProfileSlug("artist#press"), false);
});

test("published artist profiles map only supported public fields", () => {
  assert.deepEqual(mapPublishedArtistProfile(profile()), {
    slug: "artist-a",
    displayName: "ARTIST-A",
    biography: "PUBLIC BIOGRAPHY",
    alternativeName: "",
    city: "",
    country: "",
    websiteUrl: "",
    socialUrl: "",
    pronouns: "",
    publicContactEmail: "",
    showWorks: true,
    showPresentations: true,
    showAgenda: true,
    showCv: true,
    showPress: true
  });
});

test("unpublished and deleted profiles share the unavailable mapping", () => {
  assert.equal(mapPublishedArtistProfile(profile(IDS.profileA, "draft", { publication_status: "draft" })), null);
  assert.equal(mapPublishedArtistProfile(profile(IDS.profileA, "deleted", { deleted_at: "2026-08-02T00:00:00Z" })), null);
});

test("a published profile supports an empty Works state", () => {
  const mapped = mapPublicProfileResult(profile(), [], [], publicUrl);
  assert.equal(mapped.kind, "available");
  assert.deepEqual(mapped.works, []);
});

test("profile Works order by year, nulls last, update time, and stable ID", () => {
  const rows = [
    work(IDS.workA3, IDS.profileA, "2026-08-03T00:00:00Z", { year_sort: null }),
    work(IDS.workA2, IDS.profileA, "2026-08-02T00:00:00Z", { year_sort: 2025 }),
    work(IDS.workA1, IDS.profileA, "2026-08-01T00:00:00Z", { year_sort: 2026 })
  ];
  const mapped = mapPublicProfileResult(profile(), rows, rows.map((row) => cover(row.id)), publicUrl);
  assert.deepEqual(mapped.works.map((entry) => entry.id), [IDS.workA1, IDS.workA2, IDS.workA3]);
});

test("only an active public cover produces a public profile Work", () => {
  const row = work(IDS.workA1, IDS.profileA, "2026-08-01T00:00:00Z");
  assert.equal(mapPublicProfileResult(profile(), [row], [], publicUrl).works.length, 0);
  assert.equal(mapPublicProfileResult(profile(), [row], [cover(row.id, { is_cover: false })], publicUrl).works.length, 0);
  assert.equal(mapPublicProfileResult(profile(), [row], [cover(row.id)], publicUrl).works.length, 1);
});

test("private paths never survive public Work mapping", () => {
  const row = work(IDS.workA1, IDS.profileA, "2026-08-01T00:00:00Z");
  const mapped = mapPublicProfileResult(profile(), [row], [cover(row.id)], publicUrl);
  assert.equal(JSON.stringify(mapped).includes("private/"), false);
  assert.equal(Object.hasOwn(mapped.works[0].image, "publicPath"), false);
});

test("profile and artwork links use stable safe public routes", () => {
  assert.equal(createPublicProfileLink("peer-vink"), "profile.html?slug=peer-vink");
  assert.equal(createPublicProfileLink("../peer"), null);
  assert.equal(createPublicArtworkLink(IDS.workA1), `artwork.html?id=${IDS.workA1}`);
  assert.equal(createPublicArtworkLink("not-an-id"), null);
  assert.equal(createPublicPresentationLink(IDS.workA1), `presentation.html?id=${IDS.workA1}`);
  assert.equal(createPublicPresentationLink("not-an-id"), null);
});

test("public profile identifiers accept only UUID route values", () => {
  assert.equal(isValidPublicProfileId(IDS.profileA), true);
  assert.equal(isValidPublicProfileId("artist-a"), false);
  assert.equal(isValidPublicProfileId("../private"), false);
});

test("Discover mapping excludes drafts, deleted Works, and missing public covers", () => {
  const published = work(IDS.workA1, IDS.profileA, "2026-08-03T00:00:00Z");
  const draft = work(IDS.workA2, IDS.profileA, "2026-08-02T00:00:00Z", { visibility: "draft" });
  const deleted = work(IDS.workA3, IDS.profileA, "2026-08-01T00:00:00Z", { deleted_at: "2026-08-03T00:00:00Z" });
  const mapped = mapDiscoverResult(
    [draft, deleted, published],
    [profile()],
    [cover(published.id), cover(draft.id), cover(deleted.id)],
    publicUrl
  );
  assert.deepEqual(mapped.map((entry) => entry.id), [published.id]);
});

test("Discover excludes Works owned by unpublished profiles", () => {
  const row = work(IDS.workA1, IDS.profileA, "2026-08-01T00:00:00Z");
  const mapped = mapDiscoverResult(
    [row],
    [profile(IDS.profileA, "artist-a", { publication_status: "draft" })],
    [cover(row.id)],
    publicUrl
  );
  assert.deepEqual(mapped, []);
});

test("Discover mapping uses base publication chronology with stable IDs", () => {
  const rows = [
    work(IDS.workA2, IDS.profileA, "2026-08-01T00:00:00Z"),
    work(IDS.workA1, IDS.profileA, "2026-08-02T00:00:00Z")
  ];
  assert.deepEqual(
    mapDiscoverResult(rows, [profile()], rows.map((row) => cover(row.id)), publicUrl).map((entry) => entry.id),
    [IDS.workA1, IDS.workA2]
  );
});

test("artist spreading avoids an immediate repeat when another artist is available", () => {
  const ordered = spreadDiscoverWorks([
    item(IDS.workA1, "a", "2026-08-08"),
    item(IDS.workA2, "a", "2026-08-07"),
    item(IDS.workB1, "b", "2026-08-06")
  ]);
  assert.deepEqual(ordered.map((entry) => entry.artistKey), ["a", "b", "a"]);
});

test("five artists provide the preferred four intervening Work gap", () => {
  const ordered = spreadDiscoverWorks([
    item(IDS.workA1, "a", "2026-08-08"),
    item(IDS.workA2, "a", "2026-08-07"),
    item(IDS.workA3, "a", "2026-08-06"),
    item(IDS.workB1, "b", "2026-08-05"),
    item(IDS.workC1, "c", "2026-08-04"),
    item(IDS.workD1, "d", "2026-08-03"),
    item(IDS.workE1, "e", "2026-08-02")
  ]);
  assert.equal(PREFERRED_ARTIST_GAP, 4);
  assert.deepEqual(ordered.slice(0, 6).map((entry) => entry.artistKey), ["a", "b", "c", "d", "e", "a"]);
});

test("two artists relax the preferred gap without immediate repetition", () => {
  const ordered = spreadDiscoverWorks([
    item(IDS.workA1, "a", "2026-08-04"),
    item(IDS.workA2, "a", "2026-08-03"),
    item(IDS.workB1, "b", "2026-08-02"),
    item(IDS.workB2, "b", "2026-08-01")
  ]);
  assert.deepEqual(ordered.map((entry) => entry.artistKey), ["a", "b", "a", "b"]);
});

test("three artists relax gracefully and spread three recent Works by one artist", () => {
  const ordered = spreadDiscoverWorks([
    item(IDS.workA1, "a", "2026-08-06"),
    item(IDS.workA2, "a", "2026-08-05"),
    item(IDS.workA3, "a", "2026-08-04"),
    item(IDS.workB1, "b", "2026-08-03"),
    item(IDS.workC1, "c", "2026-08-02")
  ]);
  assert.deepEqual(ordered.slice(0, 5).map((entry) => entry.artistKey), ["a", "b", "c", "a", "a"]);
});

test("one artist falls back to unchanged chronology", () => {
  const rows = [
    item(IDS.workA2, "a", "2026-08-02"),
    item(IDS.workA1, "a", "2026-08-03")
  ];
  assert.deepEqual(spreadDiscoverWorks(rows).map((entry) => entry.id), [IDS.workA1, IDS.workA2]);
});

test("artist spreading is deterministic, complete, and duplicate-free", () => {
  const rows = [
    item(IDS.workA1, "a", "2026-08-03"),
    item(IDS.workA2, "a", "2026-08-02"),
    item(IDS.workB1, "b", "2026-08-01")
  ];
  const first = spreadDiscoverWorks(rows).map((entry) => entry.id);
  const second = spreadDiscoverWorks(rows).map((entry) => entry.id);
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, rows.length);
  assert.deepEqual(new Set(first), new Set(rows.map((entry) => entry.id)));
});

test("engagement-like fields never affect Discover order", () => {
  const first = item(IDS.workA1, "a", "2026-08-03", 0);
  const second = item(IDS.workB1, "b", "2026-08-02", 999999);
  assert.deepEqual(spreadDiscoverWorks([second, first]).map((entry) => entry.id), [first.id, second.id]);
});

test("SINGLE and GRID can consume the identical ordered dataset", () => {
  const ordered = spreadDiscoverWorks([
    item(IDS.workA1, "a", "2026-08-03"),
    item(IDS.workB1, "b", "2026-08-02")
  ]);
  const single = ordered.map((entry) => entry.id);
  const grid = ordered.map((entry) => entry.id);
  assert.deepEqual(single, grid);
});

test("appended batches preserve visible order and recent-artist decisions", () => {
  const ordered = spreadDiscoverWorks([
    item(IDS.workA1, "a", "2026-08-04"),
    item(IDS.workA2, "a", "2026-08-03"),
    item(IDS.workB1, "b", "2026-08-02"),
    item(IDS.workC1, "c", "2026-08-01")
  ]);
  const state = createDiscoverBatchState(ordered, 2);
  const first = state.next();
  const second = state.next();
  assert.deepEqual(second.visible.slice(0, 2), first.visible);
  assert.deepEqual(second.visible, ordered);
  assert.equal(second.hasMore, false);
});

test("public projections are explicit and suppress private/internal columns", () => {
  const selects = [
    PUBLIC_PROFILE_SELECT,
    PUBLIC_WORK_SELECT,
    PUBLIC_COVER_SELECT,
    DISCOVER_PROFILE_SELECT,
    DISCOVER_WORK_SELECT
  ].join(",");
  assert.equal(selects.includes("*"), false);
  assert.equal(selects.includes("private_object_path"), false);
  assert.equal(selects.includes("account_id"), false);
  assert.equal(selects.includes("audit"), false);
});

test("public request failures become generic connection errors", async () => {
  await assert.rejects(
    () => requestPublicRows(
      { supabaseUrl: "http://127.0.0.1:54321", supabaseKey: "safe" },
      "works",
      new URLSearchParams(),
      async () => { throw new Error("database connection string"); }
    ),
    (error) => (
      error instanceof PublicDataError &&
      error.message === "PUBLIC DATA IS CURRENTLY UNAVAILABLE" &&
      !error.message.includes("database")
    )
  );
});

test("public profiles continue stable Work and cover batches until complete", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    return work(id, IDS.profileA, `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z`);
  });
  const covers = rows.map((row) => cover(row.id));
  const workOffsets = [];
  let coverRequests = 0;
  const request = async (_config, table, query) => {
    if (table === "public_profiles") return [profile()];
    if (table === "rpc/get_public_profile_presentation_summaries") return [];
    if (table === "activity_occurrences") return [];
    if (table === "profile_press_items") return [];
    if (table === "profile_press_items") return [];
    if (table === "cv_categories") return [];
    if (table === "works") {
      const offset = Number(query.get("offset"));
      workOffsets.push(offset);
      return rows.slice(offset, offset + Number(query.get("limit")));
    }
    coverRequests += 1;
    const ids = query.get("work_id").slice(4, -1).split(",");
    return covers.filter((entry) => ids.includes(entry.work_id));
  };
  const client = {
    storage: {
      from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: publicUrl(path) } }) })
    }
  };
  const result = await createPublicProfileRepository(client, {}, request).getProfile("artist-a");
  assert.deepEqual(workOffsets, [0, 100]);
  assert.equal(coverRequests, 2);
  assert.equal(result.works.length, 101);
});

test("public profile Presentation availability uses the safe summary projection for accepted participant history", async () => {
  const participantPresentationId = "99999999-9999-4999-8999-999999999992";
  const requests = [];
  const request = async (_config, table, query) => {
    requests.push({ table, query });
    if (table === "public_profiles") return [profile()];
    if (table === "rpc/get_public_profile_presentation_summaries") {
      return [
        { id: participantPresentationId, owner_profile_id: IDS.profileB }
      ];
    }
    if (["activity_occurrences", "cv_categories", "profile_press_items"].includes(table)) return [];
    if (table === "works") return [];
    throw new Error(`Unexpected public profile resource: ${table}`);
  };
  const client = {
    storage: {
      from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: publicUrl(path) } }) })
    }
  };

  const result = await createPublicProfileRepository(client, {}, request).getProfile("artist-a");

  assert.equal(result.kind, "available");
  assert.equal(result.hasPublicPresentations, true);
  const summaryRequest = requests.find(({ table }) => (
    table === "rpc/get_public_profile_presentation_summaries"
  ));
  assert.equal(summaryRequest.query.get("target_profile_id"), IDS.profileA);
  assert.equal(requests.some(({ table }) => table === "profile_activities"), false);
  assert.equal(result.profile.showPresentations, true);
});

test("public profile Presentation navigation stays unavailable for an empty safe summary", async () => {
  const requests = [];
  const request = async (_config, table) => {
    requests.push(table);
    if (table === "public_profiles") return [profile()];
    if (table === "rpc/get_public_profile_presentation_summaries") return [];
    if (["activity_occurrences", "cv_categories", "profile_press_items"].includes(table)) return [];
    if (table === "works") return [];
    throw new Error(`Unexpected public profile resource: ${table}`);
  };
  const client = {
    storage: {
      from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: publicUrl(path) } }) })
    }
  };

  const result = await createPublicProfileRepository(client, {}, request).getProfile("artist-a");

  assert.equal(result.kind, "available");
  assert.equal(result.hasPublicPresentations, false);
  assert.equal(requests.includes("profile_activities"), false);
});

test("linked participant Work lookup reuses the bounded public profile projection", async () => {
  const queries = [];
  const request = async (_config, table, query) => {
    queries.push([table, query]);
    if (table === "public_profiles") return [profile()];
    if (["rpc/get_public_profile_presentation_summaries", "activity_occurrences", "cv_categories", "profile_press_items"].includes(table)) return [];
    if (table === "works") return [work(IDS.workA1, IDS.profileA, "2026-08-01T00:00:00Z")];
    if (table === "work_images") return [cover(IDS.workA1)];
    return [];
  };
  const client = {
    storage: {
      from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: publicUrl(path) } }) })
    }
  };
  const repository = createPublicProfileRepository(client, {}, request);

  const result = await repository.getProfileById(IDS.profileA);
  assert.equal(result.kind, "available");
  assert.equal(result.works[0].id, IDS.workA1);
  assert.equal(queries[0][0], "public_profiles");
  assert.equal(queries[0][1].get("id"), `eq.${IDS.profileA}`);
  assert.equal(queries[0][1].get("publication_status"), "eq.published");
  assert.equal((await repository.getProfileById("not-a-profile-id")).kind, "unavailable");
});
