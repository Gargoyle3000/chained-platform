import {
  createPublicImageUrl,
  requestPublicRows
} from "./public-data-request.mjs";
import { isValidPublicWorkId } from "./public-work-mapping.mjs";

export const PUBLIC_WORK_IMAGE_SELECT = [
  "id",
  "work_id",
  "public_object_path",
  "pixel_width",
  "pixel_height",
  "sort_order",
  "is_cover"
].join(",");

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validImage(row, workId) {
  return Boolean(
    row &&
    row.work_id === workId &&
    isValidPublicWorkId(row.id) &&
    cleanText(row.public_object_path)
  );
}

function byRemainingOrder(first, second) {
  const orderDifference = Number(first.sort_order) - Number(second.sort_order);
  return orderDifference || String(first.id).localeCompare(String(second.id), "en");
}

/**
 * Produces the public carousel sequence without retaining a Storage path in
 * the UI model. The currently rendered cover remains first even if it is not
 * first by the editor's independent sort order.
 */
export function mapPublicWorkImages(rows, workId, coverImage, publicUrl) {
  if (!isValidPublicWorkId(workId) || !coverImage?.src) return Object.freeze([]);

  const images = [...(rows || [])]
    .filter((row) => validImage(row, workId))
    .map((row) => {
      const src = publicUrl(row.public_object_path);
      if (!src) return null;
      return Object.freeze({
        id: row.id,
        src,
        width: Number(row.pixel_width) > 0 ? Number(row.pixel_width) : null,
        height: Number(row.pixel_height) > 0 ? Number(row.pixel_height) : null,
        sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        isCover: row.is_cover === true
      });
    })
    .filter(Boolean);

  const cover = images.find((image) => image.isCover) || Object.freeze({
    id: "cover",
    src: coverImage.src,
    width: coverImage.width || null,
    height: coverImage.height || null,
    sortOrder: -1,
    isCover: true
  });
  const remaining = images
    .filter((image) => image.id !== cover.id && image.src !== cover.src)
    .sort(byRemainingOrder);

  return Object.freeze([cover, ...remaining]);
}

export function createPublicWorkImageLoader(
  client,
  config,
  request = requestPublicRows
) {
  const cache = new Map();

  return Object.freeze({
    load(workId, coverImage) {
      if (!isValidPublicWorkId(workId) || !coverImage?.src) {
        return Promise.resolve(Object.freeze([]));
      }
      if (!cache.has(workId)) {
        const query = new URLSearchParams({
          select: PUBLIC_WORK_IMAGE_SELECT,
          work_id: `eq.${workId}`,
          public_object_path: "not.is.null",
          order: "sort_order.asc,id.asc"
        });
        cache.set(workId, request(config, "work_images", query)
          .then((rows) => mapPublicWorkImages(
            rows,
            workId,
            coverImage,
            (path) => createPublicImageUrl(client, path)
          ))
          .catch(() => Object.freeze([])));
      }
      return cache.get(workId);
    }
  });
}
