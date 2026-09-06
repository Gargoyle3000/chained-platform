import assert from "node:assert/strict";
import test from "node:test";
import { applyExportImageSelection, createExportImageSelectionState } from "../data/export-image-selection-state.mjs";

const work = Object.freeze({ id: "work", images: Object.freeze([
  Object.freeze({ id: "detail", order: 2, uploadStatus: "ready" }),
  Object.freeze({ id: "cover", order: 4, isCover: true, uploadStatus: "ready" }),
  Object.freeze({ id: "first", order: 1, uploadStatus: "ready" })
]) });

test("export image selection defaults to the cover and keeps image-id ordered local state", () => {
  const selection = createExportImageSelectionState([work]);
  assert.deepEqual(selection.ids("work"), ["cover"]);
  assert.equal(selection.toggle("work", "detail"), true);
  assert.deepEqual(selection.ids("work"), ["detail", "cover"]);
  assert.equal(selection.toggle("work", "cover"), true);
  assert.deepEqual(selection.ids("work"), ["detail"]);
  assert.equal(selection.toggle("work", "detail"), false);
  assert.deepEqual(work.images.map((image) => image.id), ["detail", "cover", "first"]);
});

test("export image selection falls back to first eligible image and intersects fresh media", () => {
  const noCover = { id: "fallback", images: [{ id: "later", order: 2, uploadStatus: "ready" }, { id: "first", order: 1, uploadStatus: "ready" }] };
  const selection = createExportImageSelectionState([noCover]);
  assert.deepEqual(selection.ids("fallback"), ["first"]);
  assert.deepEqual(applyExportImageSelection([{ ...noCover, images: [{ id: "later", order: 2, uploadStatus: "ready" }] }], selection), []);
});
