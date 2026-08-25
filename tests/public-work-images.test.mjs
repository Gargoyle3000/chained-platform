import test from "node:test";
import assert from "node:assert/strict";

import {
  createPublicWorkImageLoader,
  mapPublicWorkImages,
  PUBLIC_WORK_IMAGE_SELECT
} from "../data/public-work-images.mjs";

const WORK_ID = "11111111-1111-4111-8111-111111111111";
const COVER_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_ID = "33333333-3333-4333-8333-333333333333";
const THIRD_ID = "44444444-4444-4444-8444-444444444444";
const publicUrl = (path) => path ? `https://media.test/${encodeURIComponent(path)}` : null;
const cover = Object.freeze({ src: publicUrl("cover.webp"), width: 1200, height: 800 });

function row(id, overrides = {}) {
  return {
    id,
    work_id: WORK_ID,
    public_object_path: `${id}.webp`,
    pixel_width: 800,
    pixel_height: 1200,
    sort_order: 1,
    is_cover: false,
    ...overrides
  };
}

test("public carousel images keep the current cover first then sort remaining images", () => {
  const images = mapPublicWorkImages([
    row(THIRD_ID, { sort_order: 4 }),
    row(COVER_ID, { public_object_path: "cover.webp", is_cover: true, sort_order: 9 }),
    row(SECOND_ID, { sort_order: 1 })
  ], WORK_ID, cover, publicUrl);
  assert.deepEqual(images.map((image) => image.id), [COVER_ID, SECOND_ID, THIRD_ID]);
});

test("public carousel mapping omits invalid and private-only input", () => {
  const images = mapPublicWorkImages([
    row(COVER_ID, { public_object_path: "cover.webp", is_cover: true }),
    row(SECOND_ID, { public_object_path: null, private_object_path: "private/original.webp" }),
    { ...row(THIRD_ID), work_id: "not-a-work" }
  ], WORK_ID, cover, publicUrl);
  assert.equal(images.length, 1);
  assert.equal(JSON.stringify(images).includes("private/"), false);
  assert.equal(PUBLIC_WORK_IMAGE_SELECT.includes("private_object_path"), false);
});

test("per-Work public image loader is bounded and deduplicates the page-session request", async () => {
  const calls = [];
  const request = async (_config, table, query) => {
    calls.push({ table, query });
    return [row(COVER_ID, { public_object_path: "cover.webp", is_cover: true }), row(SECOND_ID)];
  };
  const client = { storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: publicUrl(path) } }) }) } };
  const loader = createPublicWorkImageLoader(client, { supabaseUrl: "https://api.test", supabaseKey: "public" }, request);
  const [first, second] = await Promise.all([loader.load(WORK_ID, cover), loader.load(WORK_ID, cover)]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "work_images");
  assert.equal(calls[0].query.get("work_id"), `eq.${WORK_ID}`);
  assert.equal(calls[0].query.get("order"), "sort_order.asc,id.asc");
  assert.equal(first.length, 2);
  assert.strictEqual(first, second);
});

test("a loader is inert until a rendered Work requests its own secondary metadata", () => {
  let requests = 0;
  const loader = createPublicWorkImageLoader({}, {}, async () => { requests += 1; return []; });
  assert.ok(loader);
  assert.equal(requests, 0);
});
