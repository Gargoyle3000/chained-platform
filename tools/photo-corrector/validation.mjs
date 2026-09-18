export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 50_000_000;
const TYPES = new Set(["image/jpeg", "image/png"]);

export function validateFile(file) {
  if (!file || !TYPES.has(file.type)) return { valid: false, message: "USE A JPG, JPEG OR PNG IMAGE" };
  if (file.size > MAX_BYTES) return { valid: false, message: "IMAGE EXCEEDS 20 MB LIMIT" };
  return { valid: true };
}

export function validateDimensions(width, height) {
  return width * height <= MAX_PIXELS
    ? { valid: true }
    : { valid: false, message: "IMAGE EXCEEDS 50 MEGAPIXEL LIMIT" };
}
