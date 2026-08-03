import {
  createPublicArtworkLink,
  createPublicProfileLink,
  isValidProfileSlug,
  isValidPublicWorkId
} from "./public-work-mapping.mjs";

export const FOLLOWING_FEED_FIELDS = Object.freeze([
  "work_id",
  "title",
  "year_label",
  "published_at",
  "artist_display_name",
  "artist_slug",
  "public_object_path",
  "pixel_width",
  "pixel_height"
]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function compareFollowingChronology(first, second) {
  const difference = Date.parse(second.publishedAt) - Date.parse(first.publishedAt);
  return difference || first.id.localeCompare(second.id, "en");
}

export function mapFollowingFeedRow(row, publicUrl) {
  if (
    !row ||
    (row.visibility != null && row.visibility !== "published") ||
    row.work_deleted_at != null ||
    (row.profile_publication_status != null && row.profile_publication_status !== "published") ||
    row.profile_deleted_at != null ||
    (row.is_cover != null && row.is_cover !== true) ||
    row.image_deleted_at != null ||
    !isValidPublicWorkId(row.work_id) ||
    !cleanText(row.title) ||
    !validTimestamp(row.published_at) ||
    !cleanText(row.artist_display_name) ||
    !isValidProfileSlug(row.artist_slug) ||
    !cleanText(row.public_object_path)
  ) return null;

  const imageSource = publicUrl(row.public_object_path);
  const artworkHref = createPublicArtworkLink(row.work_id);
  const profileHref = createPublicProfileLink(row.artist_slug);
  if (!imageSource || !artworkHref || !profileHref) return null;

  return Object.freeze({
    id: row.work_id,
    title: cleanText(row.title),
    yearLabel: cleanText(row.year_label),
    publishedAt: row.published_at,
    artistName: cleanText(row.artist_display_name),
    artistSlug: row.artist_slug,
    artworkHref,
    profileHref,
    image: Object.freeze({
      src: imageSource,
      width: Number(row.pixel_width) > 0 ? Number(row.pixel_width) : null,
      height: Number(row.pixel_height) > 0 ? Number(row.pixel_height) : null
    })
  });
}

export function mapFollowingFeed(rows, publicUrl) {
  const seen = new Set();
  return (rows || [])
    .map((row) => mapFollowingFeedRow(row, publicUrl))
    .filter((item) => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

export function createFollowingCursor(item) {
  if (!item || !isValidPublicWorkId(item.id) || !validTimestamp(item.publishedAt)) return null;
  return Object.freeze({ publishedAt: item.publishedAt, workId: item.id });
}

export function appendFollowingPage(existing, incoming) {
  const seen = new Set((existing || []).map((item) => item.id));
  return Object.freeze([
    ...(existing || []),
    ...(incoming || []).filter((item) => !seen.has(item.id))
  ]);
}
