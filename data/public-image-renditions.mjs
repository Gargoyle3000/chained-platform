import { derivativeLargePublicPath } from "./work-mapping.mjs";

export const PUBLIC_LARGE_MIN_VIEWPORT = 701;
export const PUBLIC_LARGE_MEDIA_QUERY = `(min-width: ${PUBLIC_LARGE_MIN_VIEWPORT}px)`;

function canonicalImageIdFromSmallPath(path) {
  const parts = typeof path === "string" ? path.trim().split("/") : [];
  return parts.length === 5 && parts.at(-1) === "small.webp" ? parts.at(-2) : null;
}

/**
 * Keep public listing projections to URLs only while deriving LARGE strictly
 * from an already-authorized canonical SMALL sibling. Legacy paths therefore
 * never gain an invented fallback.
 */
export function createPublicImageRendition(row, publicUrl) {
  const smallPath = typeof row?.public_object_path === "string"
    ? row.public_object_path.trim()
    : "";
  const smallSrc = smallPath ? publicUrl(smallPath) : null;
  const imageId = canonicalImageIdFromSmallPath(smallPath);
  const largePath = derivativeLargePublicPath(smallPath, imageId);
  const largeSrc = largePath ? publicUrl(largePath) : null;
  if (!smallSrc) return null;

  return Object.freeze({
    src: smallSrc,
    smallSrc,
    largeSrc: largeSrc || null,
    width: Number(row?.pixel_width) > 0 ? Number(row.pixel_width) : null,
    height: Number(row?.pixel_height) > 0 ? Number(row.pixel_height) : null
  });
}

export function createPublicResponsiveImage(documentRef, image, rendition) {
  const picture = documentRef.createElement("picture");
  picture.className = "public-responsive-image";
  if (picture.style) picture.style.display = "contents";
  if (rendition?.largeSrc) {
    const large = documentRef.createElement("source");
    large.media = PUBLIC_LARGE_MEDIA_QUERY;
    large.srcset = rendition.largeSrc;
    picture.append(large);
  }
  updatePublicResponsiveImage(image, picture, rendition);
  picture.append(image);
  return picture;
}

export function updatePublicResponsiveImage(image, picture, rendition) {
  if (!image || !rendition?.smallSrc) return;
  const large = picture?.querySelector?.("source");
  if (large) large.srcset = rendition.largeSrc || "";
  image.src = rendition.smallSrc;
  image.loading = "lazy";
}
