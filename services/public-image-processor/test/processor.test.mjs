import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { SOURCE_BYTE_LIMIT } from "../lib/constants.mjs";
import { processImage, ProcessorFailure } from "../lib/processor.mjs";

async function temporary() { return mkdtemp(join(os.tmpdir(), "chained-public-image-")); }
function cleanup(directory) { void rm(directory, { recursive: true, force: true, maxRetries: 0 }).catch(() => {}); }
async function expectFailure(action, code) {
  await assert.rejects(action, (error) => error instanceof ProcessorFailure && error.code === code);
}

test("creates deterministic SMALL and LARGE WebP derivatives with a pinned ICC", async (t) => {
  const directory = await temporary(); t.after(() => cleanup(directory));
  const input = join(directory, "source.png");
  await sharp({ create: { width: 1600, height: 1000, channels: 4, background: { r: 40, g: 100, b: 200, alpha: 0.5 } } }).png().toFile(input);
  const first = await processImage(input, join(directory, "first"));
  const second = await processImage(input, join(directory, "second"));
  assert.deepEqual([first.small.width, first.small.height], [960, 600]);
  assert.deepEqual([first.large.width, first.large.height], [1600, 1000]);
  assert.equal(first.small.hasAlpha, true); assert.equal(first.large.hasIcc, true);
  assert.equal(first.small.checksumSha256, second.small.checksumSha256);
  assert.match(await readFile(first.large.path, "utf8"), /RIFF/);
});

test("does not upscale sources", async (t) => {
  const directory = await temporary(); t.after(() => cleanup(directory));
  const input = join(directory, "tiny.jpg");
  await sharp({ create: { width: 40, height: 20, channels: 3, background: "#123456" } }).jpeg().toFile(input);
  const result = await processImage(input, join(directory, "out"));
  assert.deepEqual([result.small.width, result.small.height], [40, 20]);
  assert.deepEqual([result.large.width, result.large.height], [40, 20]);
});

test("normalizes EXIF orientation physically", async (t) => {
  const directory = await temporary(); t.after(() => cleanup(directory));
  const input = join(directory, "rotated.jpg");
  await sharp({ create: { width: 100, height: 200, channels: 3, background: "#456789" } }).withMetadata({ orientation: 6 }).jpeg().toFile(input);
  const result = await processImage(input, join(directory, "out"));
  const metadata = await sharp(result.large.path).metadata();
  assert.deepEqual([metadata.width, metadata.height], [200, 100]);
  assert.equal(metadata.orientation, undefined);
});

test("rejects corrupt, unsupported, oversized, and unsafe-pixel inputs safely", async (t) => {
  const directory = await temporary(); t.after(() => cleanup(directory));
  const corrupt = join(directory, "corrupt.jpg"); await writeFile(corrupt, "not an image");
  await expectFailure(() => processImage(corrupt, join(directory, "out")), "decoder_failed");
  const gif = join(directory, "unsupported.gif"); await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).gif().toFile(gif);
  await expectFailure(() => processImage(gif, join(directory, "out")), "unsupported_format");
  const largeBytes = join(directory, "large.bin"); await writeFile(largeBytes, Buffer.alloc(SOURCE_BYTE_LIMIT + 1));
  await expectFailure(() => processImage(largeBytes, join(directory, "out")), "source_byte_limit_rejected");
  const pixels = join(directory, "pixels.jpg"); await sharp({ create: { width: 100, height: 100, channels: 3, background: "green" } }).jpeg().toFile(pixels);
  await expectFailure(() => processImage(pixels, join(directory, "out"), { maxDecodedPixels: 9999 }), "decoded_pixel_limit_rejected");
});

test("rejects untagged non-RGB colour input", async (t) => {
  const directory = await temporary(); t.after(() => cleanup(directory));
  const input = join(directory, "cmyk.jpg");
  await sharp({ create: { width: 100, height: 100, channels: 3, background: "blue" } }).toColourspace("cmyk").jpeg().toFile(input);
  await expectFailure(() => processImage(input, join(directory, "out")), "unsupported_untagged_colour");
});

test("processes AVIF where the bundled libvips decoder identifies AV1 HEIF", async (t) => {
  const directory = await temporary(); t.after(() => cleanup(directory));
  const input = join(directory, "source.avif");
  await sharp({ create: { width: 96, height: 64, channels: 3, background: "purple" } }).avif().toFile(input);
  const result = await processImage(input, join(directory, "out"));
  assert.equal(result.source.format, "avif");
  assert.equal(result.large.mimeType, "image/webp");
});
