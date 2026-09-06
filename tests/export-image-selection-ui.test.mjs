import test from "node:test";
import assert from "node:assert/strict";
import { createExportThumbnailSession } from "../data/export-image-selection-ui.mjs";

const image = (id = "image-one") => ({ id, src: `https://public.example/${id}.webp` });

test("private picker previews resolve once per image and retain the same URL across selection renders", async () => {
  let calls = 0;
  const session = createExportThumbnailSession({ resolveThumbnail: async (item) => { calls += 1; return `blob:${item.id}`; } });
  assert.equal(await session.resolve(image()), "blob:image-one");
  assert.equal(await session.resolve(image()), "blob:image-one");
  assert.equal(calls, 1);
  assert.equal(session.state(image()).state, "ready");
  assert.equal(session.state(image()).src, "blob:image-one");
});

test("failed picker previews are stable and do not retry during the same session", async () => {
  let calls = 0;
  const session = createExportThumbnailSession({ resolveThumbnail: async () => { calls += 1; throw new Error("unavailable"); } });
  assert.equal(await session.resolve(image()), null);
  assert.equal(await session.resolve(image()), null);
  assert.equal(session.state(image()).state, "failed");
  assert.equal(calls, 1);
});

test("picker disposal revokes each resolved private preview once and a new session resolves again", async () => {
  const revoked = [];
  let calls = 0;
  const resolver = async (item) => { calls += 1; return `blob:${item.id}:${calls}`; };
  const first = createExportThumbnailSession({ resolveThumbnail: resolver, disposeThumbnail: (url) => revoked.push(url) });
  await first.resolve(image());
  first.dispose();
  first.dispose();
  assert.deepEqual(revoked, ["blob:image-one:1"]);
  const second = createExportThumbnailSession({ resolveThumbnail: resolver, disposeThumbnail: (url) => revoked.push(url) });
  assert.equal(await second.resolve(image()), "blob:image-one:2");
  second.dispose();
  assert.equal(calls, 2);
  assert.deepEqual(revoked, ["blob:image-one:1", "blob:image-one:2"]);
});

test("public SELECT thumbnails retain their supplied public source without private preview behavior", async () => {
  const session = createExportThumbnailSession();
  assert.equal(await session.resolve(image("public-image")), "https://public.example/public-image.webp");
  session.dispose();
});
