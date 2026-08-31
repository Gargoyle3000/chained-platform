import { WorkError, WORK_ERROR_CODES } from "./work-errors.mjs";
import { materialDisplayValues, materialSearchTerms } from "./material-terms.mjs";
import { normalizeHttpUrl } from "./url-normalization.mjs";

export const WORK_COLUMNS = Object.freeze([
  "id", "owner_profile_id", "title", "year_sort", "year_label", "work_type",
  "format_discipline", "primary_medium", "support_base", "additional_materials",
  "height", "width", "depth", "dimension_unit", "duration_text", "edition_text",
  "description", "collaborator_name", "collaborator_url", "photo_credit_name",
  "photo_credit_url", "visibility", "published_at", "created_at", "updated_at"
]);

export const WORK_SELECT = WORK_COLUMNS.join(",");
export const PUBLIC_IMAGE_COLUMNS = Object.freeze([
  "id", "work_id", "public_object_path", "mime_type", "file_size", "pixel_width",
  "pixel_height", "sort_order", "is_cover", "created_at", "updated_at"
]);
export const PUBLIC_IMAGE_SELECT = PUBLIC_IMAGE_COLUMNS.join(",");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIMENSION_UNITS = new Set(["mm", "cm", "m", "in"]);

export function isValidWorkId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value) {
  return text(value) || null;
}

function optionalUrl(value, label) {
  try {
    return normalizeHttpUrl(value, null);
  } catch {
    throw new WorkError(WORK_ERROR_CODES.INVALID, `${label} MUST USE A VALID HTTP OR HTTPS URL`);
  }
}

export function derivativeLargePublicPath(path, imageId) {
  const safePath = typeof path === "string" ? path.trim() : "";
  if (!isValidWorkId(imageId)) return null;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const escapedId = imageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${uuid}/${uuid}/${uuid}/${escapedId}/small\\.webp$`, "i").test(safePath)
    ? safePath.replace(/small\.webp$/i, "large.webp")
    : null;
}

function dimension(value, label) {
  const normalized = text(value);
  if (!normalized) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || number > 1000000) {
    throw new WorkError(WORK_ERROR_CODES.INVALID, `${label} MUST BE A SENSIBLE NON-NEGATIVE NUMBER`);
  }
  return number;
}

function materialsForSave(record) {
  if (Object.hasOwn(record, "materials")) return materialDisplayValues(record.materials);
  return materialDisplayValues([
    record.primaryMedium,
    record.supportBase,
    record.additionalMaterials
  ]);
}

export function formToDatabase(record) {
  const yearLabel = text(record.year);
  let yearSort = null;
  if (yearLabel) {
    const parsed = Number(yearLabel);
    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2100) {
      throw new WorkError(WORK_ERROR_CODES.INVALID, "YEAR MUST BE BETWEEN 1900 AND 2100");
    }
    yearSort = parsed;
  }
  const unit = text(record.dimensionUnit) || "cm";
  if (!DIMENSION_UNITS.has(unit)) {
    throw new WorkError(WORK_ERROR_CODES.INVALID, "DIMENSION UNIT IS INVALID");
  }

  return Object.freeze({
    title: text(record.title),
    year_sort: yearSort,
    year_label: yearLabel || null,
    work_type: nullableText(record.workType),
    format_discipline: nullableText(record.format),
    primary_medium: null,
    support_base: null,
    additional_materials: materialsForSave(record),
    height: dimension(record.height, "HEIGHT"),
    width: dimension(record.width, "WIDTH"),
    depth: dimension(record.depth, "DEPTH"),
    dimension_unit: unit,
    duration_text: nullableText(record.duration),
    edition_text: nullableText(record.edition),
    description: nullableText(record.description),
    collaborator_name: nullableText(record.collaboratorName),
    collaborator_url: optionalUrl(record.collaboratorUrl, "COLLABORATOR LINK"),
    photo_credit_name: nullableText(record.photoCreditName),
    photo_credit_url: optionalUrl(record.photoCreditUrl, "PHOTO CREDIT LINK")
  });
}

export function databaseImageToClient(row) {
  return Object.freeze({
    id: row.id,
    workId: row.work_id,
    filename: row.original_filename || "IMAGE",
    mimeType: row.mime_type || "",
    size: Number(row.file_size) || 0,
    order: Number(row.sort_order) || 0,
    isCover: row.is_cover === true,
    uploadStatus: row.upload_status || "ready",
    publicPath: row.public_object_path || null,
    privatePath: row.private_object_path || null,
    src: "",
    blob: null
  });
}

export function databaseToWork(row, images = []) {
  const materialValues = materialDisplayValues([
    row.primary_medium,
    row.support_base,
    row.additional_materials
  ]);
  return Object.freeze({
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    title: row.title || "",
    year: row.year_label || "",
    yearSort: row.year_sort ?? null,
    workType: row.work_type || "",
    format: row.format_discipline || "",
    materials: materialValues.join(", "),
    materialTerms: materialSearchTerms(materialValues),
    height: row.height == null ? "" : String(row.height),
    width: row.width == null ? "" : String(row.width),
    depth: row.depth == null ? "" : String(row.depth),
    dimensionUnit: row.dimension_unit || "cm",
    duration: row.duration_text || "",
    edition: row.edition_text || "",
    description: row.description || "",
    collaboratorName: row.collaborator_name || "",
    collaboratorUrl: row.collaborator_url || "",
    photoCreditName: row.photo_credit_name || "",
    photoCreditUrl: row.photo_credit_url || "",
    visibility: row.visibility === "published" ? "published" : "draft",
    publishedAt: row.published_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: [...images].sort((a, b) => a.order - b.order)
  });
}

export function mapPublicArtworkRows(workRows, profileRows, imageRows, publicUrl) {
  const row = workRows?.[0];
  const profile = profileRows?.[0];
  if (!row || row.visibility !== "published" || !profile || profile.publication_status !== "published") return null;
  const images = (imageRows || [])
    .filter((image) => image.public_object_path)
    .map(databaseImageToClient)
    .map((image) => Object.freeze({ ...image, privatePath: null, src: publicUrl(derivativeLargePublicPath(image.publicPath, image.id) || image.publicPath) }));
  return Object.freeze({ ...databaseToWork(row, images), ownerProfileName: profile.display_name, ownerProfileSlug: profile.slug });
}

export function resolveManagedProfileState(profiles) {
  const items = Array.isArray(profiles) ? profiles : [];
  return Object.freeze({ kind: items.length === 0 ? "none" : items.length === 1 ? "one" : "multiple", selected: items.length === 1 ? items[0] : null, profiles: items });
}

export function publicationReadiness(work) {
  const images = work?.images || [];
  const reasons = [];
  if (!text(work?.title) || !text(work?.year) || !text(work?.workType)) reasons.push("metadata");
  if (images.length === 0) reasons.push("missing_image");
  if (images.some((image) => image.uploadStatus !== "ready")) reasons.push("unready_image");
  if (images.length > 0 && images.filter((image) => image.isCover).length !== 1) reasons.push("missing_cover");
  return Object.freeze({ ready: reasons.length === 0, reasons });
}

export function createIdempotencyState(factory = () => crypto.randomUUID()) {
  let key = null;
  return Object.freeze({ current: () => key || (key = factory()), reset: () => { key = null; } });
}

export function createObjectUrlRegistry(urlApi = URL) {
  const values = new Set();
  return Object.freeze({
    create(blob) { const value = urlApi.createObjectURL(blob); values.add(value); return value; },
    revoke(value) { if (values.delete(value)) urlApi.revokeObjectURL(value); },
    revokeAll() { values.forEach((value) => urlApi.revokeObjectURL(value)); values.clear(); },
    size() { return values.size; }
  });
}
