import { trustedImageDimensions } from "./work-media.ts";
import { assert } from "./work-media-test-helpers.ts";

function png(width: number, height: number): Uint8Array {
  const value = new Uint8Array(24);
  value.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  value.set([width >>> 24, width >>> 16, width >>> 8, width, height >>> 24, height >>> 16, height >>> 8, height], 16);
  return value;
}

Deno.test("trusted dimensions read JPEG SOF headers without decoding pixels", () => {
  const value = new Uint8Array(21);
  value.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x12, 0x34, 0x23, 0x45], 0);
  const dimensions = trustedImageDimensions(value, "image/jpeg");
  assert(dimensions?.width === 0x2345 && dimensions.height === 0x1234);
});

Deno.test("trusted dimensions read PNG IHDR dimensions", () => {
  const dimensions = trustedImageDimensions(png(4912, 7360), "image/png");
  assert(dimensions?.width === 4912 && dimensions.height === 7360);
});

Deno.test("trusted dimensions read WebP VP8X dimensions", () => {
  const value = new Uint8Array(30);
  value.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 0);
  value.set([0x7f, 0x12, 0x00, 0x3f, 0x0d, 0x00], 24);
  const dimensions = trustedImageDimensions(value, "image/webp");
  assert(dimensions?.width === 4736 && dimensions.height === 3392);
});

Deno.test("unparsed AVIF and malformed WebP headers return no trusted dimensions", () => {
  const avif = new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0]);
  const malformedWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert(trustedImageDimensions(avif, "image/avif") === null);
  assert(trustedImageDimensions(malformedWebp, "image/webp") === null);
});
