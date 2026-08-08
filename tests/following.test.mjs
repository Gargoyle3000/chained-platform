import test from "node:test";
import assert from "node:assert/strict";

import { FRONTEND_MODES } from "../auth/config.mjs";
import {
  createFollowService,
  FOLLOW_MESSAGES,
  resolveFollowAccess
} from "../data/follow-service.mjs";
import {
  appendFollowingPage,
  compareFollowingChronology,
  createFollowingCursor,
  mapFollowingFeed,
  mapFollowingFeedRow
} from "../data/following-mapping.mjs";
import {
  createFollowingRepository,
  FOLLOWING_DATA_SOURCE,
  FOLLOWING_INITIAL_BATCH,
  resolveFollowingRepository
} from "../data/following-repository.mjs";
import { spreadDiscoverWorks } from "../data/discover-ordering.mjs";

const IDS = Object.freeze({
  account: "91000000-0000-4000-8000-000000000001",
  profile: "92000000-0000-4000-8000-000000000001",
  a1: "93000000-0000-4000-8000-000000000001",
  a2: "93000000-0000-4000-8000-000000000002",
  a3: "93000000-0000-4000-8000-000000000003",
  b1: "93000000-0000-4000-8000-000000000004"
});

const identity = Object.freeze({ id: IDS.profile, slug: "artist-one" });
const activeSession = Object.freeze({
  kind: "active",
  user: Object.freeze({ id: IDS.account }),
  account: Object.freeze({ status: "active" })
});

function feedRow(id, publishedAt, overrides = {}) {
  return {
    work_id: id,
    title: `WORK ${id.at(-1)}`,
    year_label: "2026",
    published_at: publishedAt,
    artist_display_name: "ARTIST ONE",
    artist_slug: "artist-one",
    public_object_path: `public/${id}.webp`,
    pixel_width: 800,
    pixel_height: 1200,
    ...overrides
  };
}

function publicUrl(path) {
  return path ? `http://127.0.0.1:54321/storage/v1/object/public/work-public/${path}` : null;
}

function followClient(initiallyFollowing = false, failures = {}) {
  let following = initiallyFollowing;
  const calls = [];

  function selectBuilder() {
    const builder = {
      eq() { return builder; },
      async maybeSingle() {
        if (failures.select) return { data: null, error: { message: "raw database detail" } };
        return { data: following ? { profile_id: IDS.profile } : null, error: null };
      }
    };
    return builder;
  }

  function deleteBuilder() {
    let matches = 0;
    const builder = {
      eq() { matches += 1; return builder; },
      then(resolve) {
        calls.push("delete");
        if (!failures.delete && matches === 2) following = false;
        resolve({ error: failures.delete ? { message: "raw database detail" } : null });
      }
    };
    return builder;
  }

  return {
    calls,
    from(table) {
      assert.equal(table, "profile_follows");
      return {
        select() { calls.push("select"); return selectBuilder(); },
        async insert() {
          calls.push("insert");
          if (failures.insert) return { error: { message: "raw database detail", code: failures.insert } };
          if (following) return { error: { code: "23505" } };
          following = true;
          return { error: null };
        },
        delete() { return deleteBuilder(); }
      };
    }
  };
}

test("follow access distinguishes signed-out, active, and invalid application accounts", () => {
  assert.equal(resolveFollowAccess({ kind: "unauthenticated" }), "signed-out");
  assert.equal(resolveFollowAccess(activeSession), "active");
  for (const kind of ["denied", "unavailable", "missing", "suspended", "disabled"]) {
    assert.equal(resolveFollowAccess({ kind }), "unavailable");
  }
});

test("signed-out profile state performs no follow-table query", async () => {
  const client = followClient();
  const service = createFollowService(client, async () => ({ kind: "unauthenticated" }));
  assert.deepEqual(await service.getFollowState(identity), { kind: "signed-out" });
  assert.deepEqual(client.calls, []);
});

test("missing, suspended, and disabled application accounts expose no follow control", async () => {
  for (const reason of ["missing_account", "suspended", "disabled"]) {
    const client = followClient();
    const service = createFollowService(client, async () => ({ kind: "denied", reason }));
    assert.deepEqual(await service.getFollowState(identity), { kind: "unavailable" });
    assert.deepEqual(client.calls, []);
  }
});

test("active signed-in follow state is authoritative", async () => {
  const absent = createFollowService(followClient(false), async () => activeSession);
  const present = createFollowService(followClient(true), async () => activeSession);
  assert.deepEqual(await absent.getFollowState(identity), { kind: "not-following" });
  assert.deepEqual(await present.getFollowState(identity), { kind: "following" });
});

test("duplicate follow is idempotent after authoritative reload", async () => {
  const service = createFollowService(followClient(true), async () => activeSession);
  assert.deepEqual(await service.followProfile(identity), { kind: "following" });
});

test("follow and unfollow failures are sanitized", async () => {
  const follow = createFollowService(followClient(false, { insert: "XX999" }), async () => activeSession);
  const unfollow = createFollowService(followClient(true, { delete: true }), async () => activeSession);
  await assert.rejects(() => follow.followProfile(identity), (error) => (
    error.message === FOLLOW_MESSAGES.followFailed && !error.message.includes("database")
  ));
  await assert.rejects(() => unfollow.unfollowProfile(identity), (error) => (
    error.message === FOLLOW_MESSAGES.unfollowFailed && !error.message.includes("database")
  ));
});

test("invalid arbitrary profile identity never reaches the follow table", async () => {
  const client = followClient();
  const service = createFollowService(client, async () => activeSession);
  assert.deepEqual(await service.getFollowState({ id: "not-a-uuid", slug: "artist-one" }), { kind: "unavailable" });
  assert.deepEqual(client.calls, []);
});

test("Following mapping keeps strict publication chronology and stable ID ties", () => {
  const rows = [
    feedRow(IDS.a2, "2026-08-03T10:00:00Z"),
    feedRow(IDS.b1, "2026-08-02T10:00:00Z"),
    feedRow(IDS.a1, "2026-08-03T10:00:00Z")
  ];
  const mapped = mapFollowingFeed(rows, publicUrl).sort(compareFollowingChronology);
  assert.deepEqual(mapped.map((item) => item.id), [IDS.a1, IDS.a2, IDS.b1]);
});

test("three consecutive Works from one artist stay consecutive without Discover spreading", () => {
  const following = mapFollowingFeed([
    feedRow(IDS.a1, "2026-08-03T12:00:00Z"),
    feedRow(IDS.a2, "2026-08-03T11:00:00Z"),
    feedRow(IDS.a3, "2026-08-03T10:00:00Z"),
    feedRow(IDS.b1, "2026-08-03T09:00:00Z", { artist_slug: "artist-two", artist_display_name: "ARTIST TWO" })
  ], publicUrl);
  assert.deepEqual(following.slice(0, 3).map((item) => item.artistSlug), ["artist-one", "artist-one", "artist-one"]);
  const discoverInput = following.map((item) => ({ ...item, artistKey: item.artistSlug }));
  assert.notDeepEqual(spreadDiscoverWorks(discoverInput).map((item) => item.id), following.map((item) => item.id));
});

test("duplicate rows are removed without dropping distinct Works", () => {
  const mapped = mapFollowingFeed([
    feedRow(IDS.a1, "2026-08-03T12:00:00Z"),
    feedRow(IDS.a1, "2026-08-03T12:00:00Z"),
    feedRow(IDS.a2, "2026-08-03T11:00:00Z")
  ], publicUrl);
  assert.deepEqual(mapped.map((item) => item.id), [IDS.a1, IDS.a2]);
});

test("defensive feed mapping rejects draft, deleted, unpublished, coverless, and pathless rows", () => {
  const base = feedRow(IDS.a1, "2026-08-03T12:00:00Z");
  const invalid = [
    { ...base, visibility: "draft" },
    { ...base, work_deleted_at: "2026-08-03" },
    { ...base, profile_publication_status: "draft" },
    { ...base, profile_deleted_at: "2026-08-03" },
    { ...base, is_cover: false },
    { ...base, image_deleted_at: "2026-08-03" },
    { ...base, public_object_path: null }
  ];
  assert.equal(invalid.every((row) => mapFollowingFeedRow(row, publicUrl) === null), true);
});

test("mapped feed exposes safe public links and suppresses private path input", () => {
  const mapped = mapFollowingFeedRow({
    ...feedRow(IDS.a1, "2026-08-03T12:00:00Z"),
    private_object_path: "secret/original.jpg",
    account_id: IDS.account
  }, publicUrl);
  assert.equal(mapped.profileHref, "profile.html?slug=artist-one");
  assert.equal(mapped.artworkHref, `artwork.html?id=${IDS.a1}`);
  assert.equal(JSON.stringify(mapped).includes("secret/original"), false);
  assert.equal(JSON.stringify(mapped).includes(IDS.account), false);
});

test("append pagination preserves visible order and stable next cursor", () => {
  const first = mapFollowingFeed([
    feedRow(IDS.a1, "2026-08-03T12:00:00Z"),
    feedRow(IDS.a2, "2026-08-03T11:00:00Z")
  ], publicUrl);
  const second = mapFollowingFeed([
    feedRow(IDS.a2, "2026-08-03T11:00:00Z"),
    feedRow(IDS.a3, "2026-08-03T10:00:00Z")
  ], publicUrl);
  assert.deepEqual(appendFollowingPage(first, second).map((item) => item.id), [IDS.a1, IDS.a2, IDS.a3]);
  assert.deepEqual(createFollowingCursor(first.at(-1)), {
    publishedAt: "2026-08-03T11:00:00Z",
    workId: IDS.a2
  });
});

test("repository requests a restrained cursor page and reports a stable continuation", async () => {
  const rpcRows = Array.from({ length: FOLLOWING_INITIAL_BATCH + 1 }, (_, index) => (
    feedRow(`94000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, `2026-08-${String(31 - index).padStart(2, "0")}T00:00:00Z`)
  ));
  let parameters;
  const client = {
    rpc(name, values) {
      assert.equal(name, "list_following_feed");
      parameters = values;
      return Promise.resolve({ data: rpcRows, error: null });
    },
    storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: publicUrl(path) } }) }) }
  };
  const page = await createFollowingRepository(client).loadFollowingFeed();
  assert.equal(parameters.feed_page_size, FOLLOWING_INITIAL_BATCH + 1);
  assert.equal(page.items.length, FOLLOWING_INITIAL_BATCH);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor.workId, page.items.at(-1).id);
});

test("mode boundary leaves prototype query-free and local Following Supabase-only", () => {
  const prototype = resolveFollowingRepository({ mode: FRONTEND_MODES.PROTOTYPE });
  assert.equal(prototype.repository, null);
  assert.equal(FOLLOWING_DATA_SOURCE, "supabase-only");
  const local = resolveFollowingRepository({ mode: FRONTEND_MODES.SUPABASE, client: {} });
  assert.equal(local.repository.mode, FRONTEND_MODES.SUPABASE);
});
