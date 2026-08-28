import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { DEFAULT_DECODED_PIXEL_LIMIT, ICC_PROFILE_VERSION, OUTPUTS, PIPELINE_VERSION, SOURCE_BYTE_LIMIT, SUPPORTED_FORMATS, SUPPORTED_RGB_SPACES } from "./constants.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const profilePath = join(root, "assets", "chained-srgb-v4.icc");

export class ProcessorFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}

function fail(code) { throw new ProcessorFailure(code); }
function safeInteger(value) { return Number.isSafeInteger(value) && value > 0; }
function dimensionsWithin(width, height, edge) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
function isWebp(buffer) { return buffer.length >= 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP"; }
function hasAlpha(metadata) { return Boolean(metadata.hasAlpha); }
function colourAction(metadata) {
  if (!SUPPORTED_RGB_SPACES.has(metadata.space)) fail(metadata.icc ? "unsupported_tagged_colour" : "unsupported_untagged_colour");
  return metadata.icc ? "transformed-tagged-rgb" : "assumed-srgb-and-tagged";
}
function isSupportedFormat(metadata) { return SUPPORTED_FORMATS.has(metadata.format) || (metadata.format === "heif" && metadata.compression === "av1"); }
function sourceFormat(metadata) { return metadata.format === "heif" ? "avif" : metadata.format; }

export async function inspectInput(inputPath, { maxDecodedPixels = DEFAULT_DECODED_PIXEL_LIMIT } = {}) {
  const sourceStat = await stat(inputPath).catch(() => fail("source_unreadable"));
  if (!sourceStat.isFile()) fail("source_unreadable");
  if (sourceStat.size > SOURCE_BYTE_LIMIT) fail("source_byte_limit_rejected");
  let metadata;
  // metadata() reads container headers without rasterising pixel data; apply the
  // product ceiling ourselves so the caller receives a stable failure code.
  try { metadata = await sharp(inputPath, { animated: false, failOn: "warning", limitInputPixels: false }).metadata(); }
  catch { fail("decoder_failed"); }
  if (!isSupportedFormat(metadata)) fail("unsupported_format");
  if ((metadata.pages ?? 1) !== 1) fail("animated_or_multiframe_rejected");
  if (!safeInteger(metadata.width) || !safeInteger(metadata.height) || metadata.width * metadata.height > maxDecodedPixels) fail("decoded_pixel_limit_rejected");
  const action = colourAction(metadata);
  return { metadata, action, sourceStat, orientedWidth: metadata.autoOrient?.width ?? metadata.width, orientedHeight: metadata.autoOrient?.height ?? metadata.height };
}

async function encodeOne(inputPath, source, outputPath, kind, maxDecodedPixels) {
  const spec = OUTPUTS[kind];
  const target = dimensionsWithin(source.orientedWidth, source.orientedHeight, spec.maxLongEdge);
  let buffer;
  try {
    buffer = await sharp(inputPath, { animated: false, failOn: "warning", limitInputPixels: maxDecodedPixels, sequentialRead: true })
      .rotate()
      .resize({ width: target.width, height: target.height, fit: "fill", withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
      .withIccProfile(profilePath, { b2a: 0 })
      .webp({ quality: spec.quality, effort: 4, smartSubsample: false })
      .toBuffer();
  } catch { fail("processing_failed"); }
  if (!isWebp(buffer)) fail("output_signature_invalid");
  await writeFile(outputPath, buffer).catch(() => fail("output_write_failed"));
  const verified = await sharp(buffer, { animated: false, failOn: "warning" }).metadata().catch(() => fail("output_verification_failed"));
  if (verified.format !== "webp" || verified.width !== target.width || verified.height !== target.height || !verified.icc) fail("output_verification_failed");
  if (source.hasAlpha && !hasAlpha(verified)) fail("alpha_not_preserved");
  return { path: outputPath, width: verified.width, height: verified.height, bytes: buffer.length, checksumSha256: createHash("sha256").update(buffer).digest("hex"), mimeType: "image/webp", hasAlpha: hasAlpha(verified), hasIcc: Boolean(verified.icc) };
}

export async function processImage(inputPath, outputDir, options = {}) {
  const started = performance.now();
  const rssBeforeBytes = process.memoryUsage.rss();
  const maxDecodedPixels = Number(options.maxDecodedPixels ?? process.env.CHAINED_MAX_DECODED_PIXELS ?? DEFAULT_DECODED_PIXEL_LIMIT);
  if (!Number.isSafeInteger(maxDecodedPixels) || maxDecodedPixels < 1) fail("invalid_decoded_pixel_limit");
  const source = await inspectInput(inputPath, { maxDecodedPixels });
  await mkdir(outputDir, { recursive: true });
  const small = await encodeOne(inputPath, { ...source, hasAlpha: hasAlpha(source.metadata) }, join(outputDir, "small.webp"), "small", maxDecodedPixels);
  const large = await encodeOne(inputPath, { ...source, hasAlpha: hasAlpha(source.metadata) }, join(outputDir, "large.webp"), "large", maxDecodedPixels);
  return { pipelineVersion: PIPELINE_VERSION, iccProfileVersion: ICC_PROFILE_VERSION, processingMs: Math.round((performance.now() - started) * 10) / 10, runtime: { rssBeforeBytes, rssAfterBytes: process.memoryUsage.rss(), maxRssKilobytes: process.resourceUsage().maxRSS }, source: { path: basename(inputPath), bytes: source.sourceStat.size, width: source.orientedWidth, height: source.orientedHeight, format: sourceFormat(source.metadata), hasAlpha: hasAlpha(source.metadata), hasIcc: Boolean(source.metadata.icc), colourAction: source.action }, small, large };
}
