export const PUBLIC_PROFILE_COLUMNS = Object.freeze([
  "id",
  "profile_type",
  "slug",
  "display_name",
  "biography",
  "alternative_name",
  "city",
  "country",
  "website_url",
  "social_url",
  "pronouns",
  "public_contact_email",
  "publication_status",
  "published_at",
  "show_works",
  "show_presentations",
  "show_agenda",
  "show_cv",
  "show_press"
]);

export const PUBLIC_WORK_COLUMNS = Object.freeze([
  "id",
  "owner_profile_id",
  "title",
  "year_sort",
  "year_label",
  "work_type",
  "format_discipline",
  "primary_medium",
  "support_base",
  "additional_materials",
  "height",
  "width",
  "depth",
  "dimension_unit",
  "visibility",
  "published_at",
  "updated_at"
]);

export const PUBLIC_COVER_COLUMNS = Object.freeze([
  "id",
  "work_id",
  "public_object_path",
  "pixel_width",
  "pixel_height",
  "is_cover"
]);

export const PUBLIC_PROFILE_SELECT = PUBLIC_PROFILE_COLUMNS.join(",");
export const PUBLIC_WORK_SELECT = PUBLIC_WORK_COLUMNS.join(",");
export const PUBLIC_COVER_SELECT = PUBLIC_COVER_COLUMNS.join(",");
export const DISCOVER_PROFILE_SELECT = [
  "id",
  "profile_type",
  "slug",
  "display_name",
  "publication_status"
].join(",");
export const DISCOVER_WORK_SELECT = [
  "id",
  "owner_profile_id",
  "title",
  "year_label",
  "format_discipline",
  "visibility",
  "published_at"
].join(",");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableIdCompare(first, second) {
  return String(first.id).localeCompare(String(second.id), "en");
}

export function isValidProfileSlug(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 100 &&
    PROFILE_SLUG_PATTERN.test(value)
  );
}

export function isValidPublicWorkId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function createPublicProfileLink(slug) {
  return isValidProfileSlug(slug)
    ? `profile.html?slug=${encodeURIComponent(slug)}`
    : null;
}

export function createPublicArtworkLink(workId) {
  return isValidPublicWorkId(workId)
    ? `artwork.html?id=${encodeURIComponent(workId)}`
    : null;
}

export function mapPublishedArtistProfile(row) {
  if (
    !row ||
    row.profile_type !== "artist" ||
    row.publication_status !== "published" ||
    row.deleted_at != null ||
    !isValidProfileSlug(row.slug) ||
    !cleanText(row.display_name)
  ) {
    return null;
  }

  return Object.freeze({
    slug: row.slug,
    displayName: cleanText(row.display_name),
    biography: cleanText(row.biography),
    alternativeName:
      cleanText(row.alternative_name),
    city: cleanText(row.city),
    country: cleanText(row.country),
    websiteUrl: cleanText(row.website_url),
    socialUrl: cleanText(row.social_url),
    pronouns: cleanText(row.pronouns),
    publicContactEmail:
      cleanText(row.public_contact_email),
    showWorks: row.show_works !== false,
    showPresentations:
      row.show_presentations !== false,
    showAgenda: row.show_agenda !== false,
    showCv: row.show_cv !== false,
    showPress: row.show_press !== false
  });
}

export function compareProfileWorks(first, second) {
  const firstYear = first.year_sort != null && Number.isFinite(Number(first.year_sort))
    ? Number(first.year_sort)
    : null;
  const secondYear = second.year_sort != null && Number.isFinite(Number(second.year_sort))
    ? Number(second.year_sort)
    : null;

  if (firstYear !== secondYear) {
    if (firstYear == null) return 1;
    if (secondYear == null) return -1;
    return secondYear - firstYear;
  }

  const updatedDifference = timestamp(second.updated_at) - timestamp(first.updated_at);
  return updatedDifference || stableIdCompare(first, second);
}

export function compareDiscoverChronology(first, second) {
  const publishedDifference =
    timestamp(second.published_at ?? second.publishedAt) -
    timestamp(first.published_at ?? first.publishedAt);

  return publishedDifference || stableIdCompare(first, second);
}

function coverByWork(imageRows) {
  const covers = new Map();

  [...(imageRows || [])]
    .filter((row) => (
      row &&
      row.is_cover === true &&
      row.deleted_at == null &&
      cleanText(row.public_object_path) &&
      isValidPublicWorkId(row.work_id)
    ))
    .sort(stableIdCompare)
    .forEach((row) => {
      if (!covers.has(row.work_id)) covers.set(row.work_id, row);
    });

  return covers;
}

function mapCover(row, publicUrl) {
  const source = publicUrl(row.public_object_path);
  if (!source) return null;

  return Object.freeze({
    src: source,
    width: Number(row.pixel_width) > 0 ? Number(row.pixel_width) : null,
    height: Number(row.pixel_height) > 0 ? Number(row.pixel_height) : null
  });
}

function isPublishedWork(row) {
  return Boolean(
    row &&
    isValidPublicWorkId(row.id) &&
    isValidPublicWorkId(row.owner_profile_id) &&
    row.visibility === "published" &&
    row.deleted_at == null &&
    row.published_at &&
    cleanText(row.title)
  );
}

function mapWork(row, cover, profile, publicUrl) {
  if (!isPublishedWork(row) || !cover || !profile) return null;

  const image = mapCover(cover, publicUrl);
  const artworkHref = createPublicArtworkLink(row.id);
  const profileHref = createPublicProfileLink(profile.slug);
  if (!image || !artworkHref || !profileHref) return null;

  return Object.freeze({
    id: row.id,
    title: cleanText(row.title),
    yearLabel: cleanText(row.year_label),
    workType: cleanText(row.work_type),
    format: cleanText(row.format_discipline),
    primaryMedium: cleanText(row.primary_medium),
    supportBase: cleanText(row.support_base),
    additionalMaterials: Array.isArray(row.additional_materials)
      ? row.additional_materials.map(cleanText).filter(Boolean)
      : [],
    height: row.height == null ? null : Number(row.height),
    width: row.width == null ? null : Number(row.width),
    depth: row.depth == null ? null : Number(row.depth),
    dimensionUnit: cleanText(row.dimension_unit),
    publishedAt: row.published_at,
    artistKey: profile.slug,
    artistName: profile.displayName,
    artistSlug: profile.slug,
    artworkHref,
    profileHref,
    image
  });
}

export function mapPublicProfileResult(profileRow, workRows, imageRows, publicUrl) {
  const profile = mapPublishedArtistProfile(profileRow);
  if (!profile) return Object.freeze({ kind: "unavailable" });

  const covers = coverByWork(imageRows);
  const works = [...(workRows || [])]
    .filter((row) => row.owner_profile_id === profileRow.id)
    .sort(compareProfileWorks)
    .map((row) => mapWork(row, covers.get(row.id), profile, publicUrl))
    .filter(Boolean);

  return Object.freeze({ kind: "available", profile, works });
}

export function mapDiscoverResult(workRows, profileRows, imageRows, publicUrl) {
  const profiles = new Map();
  (profileRows || []).forEach((row) => {
    const profile = mapPublishedArtistProfile(row);
    if (profile) profiles.set(row.id, profile);
  });

  const covers = coverByWork(imageRows);
  return [...(workRows || [])]
    .sort(compareDiscoverChronology)
    .map((row) => mapWork(
      row,
      covers.get(row.id),
      profiles.get(row.owner_profile_id),
      publicUrl
    ))
    .filter(Boolean);
}
