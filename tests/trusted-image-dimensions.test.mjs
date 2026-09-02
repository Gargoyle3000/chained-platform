import assert from "node:assert/strict";
import test from "node:test";
import { trustedImageDimensions } from "../scripts/trusted-image-dimensions.mjs";

test("maintenance dimension reader handles PNG and classic VP8", () => {
  const png = new Uint8Array(24); png.set([0x89, 0x50, 0x4e, 0x47], 0); png.set([0, 0, 5, 5, 0, 0, 7, 8], 16);
  assert.deepEqual(trustedImageDimensions(png, "image/png"), { width: 1285, height: 1800 });
  const vp8 = new Uint8Array(30); vp8.set([0x52, 0x49, 0x46, 0x46], 0); vp8.set([0x56, 0x50, 0x38, 0x20], 12); vp8.set([0x9d, 0x01, 0x2a], 23); vp8.set([0x45, 0x05, 0x08, 0x07], 26);
  assert.deepEqual(trustedImageDimensions(vp8, "image/webp"), { width: 1349, height: 1800 });
});

test("maintenance dimension reader rejects malformed headers", () => {
  assert.equal(trustedImageDimensions(new Uint8Array([1, 2, 3]), "image/webp"), null);
});
