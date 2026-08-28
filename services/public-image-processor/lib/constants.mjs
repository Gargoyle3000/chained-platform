export const PIPELINE_VERSION = "chained-public-image-sharp-0.34.1-v1";
export const ICC_PROFILE_VERSION = "chained-srgb-v4-2026-08-27";
export const SOURCE_BYTE_LIMIT = 50 * 1024 * 1024;
export const DEFAULT_DECODED_PIXEL_LIMIT = 60_000_000;
export const OUTPUTS = Object.freeze({
  small: Object.freeze({ maxLongEdge: 960, quality: 90 }),
  large: Object.freeze({ maxLongEdge: 3200, quality: 94 }),
});
export const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp", "avif"]);
export const SUPPORTED_RGB_SPACES = new Set(["srgb", "rgb", "rgb16", "scrgb"]);
