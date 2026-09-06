export const CHAINED_SELECT_MAX_WORKS = 20;
export const CHAINED_SELECT_MAX_IMAGES = 40;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en");
}

function compareText(first, second) {
  return normalized(first).localeCompare(normalized(second), "en");
}

function yearValue(work) {
  const value = Number(text(work?.year) || text(work?.yearLabel));
  return Number.isInteger(value) ? value : null;
}

export function chainedSelectLimit(works = []) {
  const selectedWorks = [...(works || [])];
  const imageCount = selectedWorks.reduce((count, work) => count + (work?.images?.length || 0), 0);
  return Object.freeze({
    workCount: selectedWorks.length,
    imageCount,
    valid: selectedWorks.length > 0 && selectedWorks.length <= CHAINED_SELECT_MAX_WORKS && imageCount <= CHAINED_SELECT_MAX_IMAGES
  });
}

/** Project membership selects Works; document order is deliberately independent. */
export function canonicalChainedSelectWorks(works = []) {
  return Object.freeze([...(works || [])].sort((first, second) => {
    const artist = compareText(first?.artistName, second?.artistName);
    if (artist) return artist;
    const firstYear = yearValue(first);
    const secondYear = yearValue(second);
    if (firstYear !== null && secondYear !== null && firstYear !== secondYear) return secondYear - firstYear;
    if (firstYear !== null && secondYear === null) return -1;
    if (firstYear === null && secondYear !== null) return 1;
    const title = compareText(first?.title, second?.title);
    return title || String(first?.id ?? "").localeCompare(String(second?.id ?? ""), "en");
  }));
}

export function resolveChainedSelectSelector(project, publisherProfiles = [], artistProfiles = []) {
  const publisherId = text(project?.publisherProfileId);
  const explicit = publisherProfiles.find((profile) => profile?.id === publisherId)
    || artistProfiles.find((profile) => profile?.id === publisherId);
  if (explicit) return text(explicit.displayName || explicit.name) || null;
  return artistProfiles.length === 1 ? text(artistProfiles[0]?.name) || null : null;
}

/**
 * Fetches the authoritative public projection anew for every attempt. It never
 * returns a partially changed Project source: callers must ask again.
 */
export async function revalidateProjectChainedSelect({ repository, workIds = [] } = {}) {
  if (!repository || typeof repository.listArchivedSelectWorks !== "function") throw new Error("repository unavailable");
  const ids = [...new Set((workIds || []).filter((id) => typeof id === "string" && id.trim()))];
  const freshWorks = await repository.listArchivedSelectWorks(ids);
  const freshIds = new Set((freshWorks || []).map((work) => work?.id).filter(Boolean));
  const unavailableIds = ids.filter((id) => !freshIds.has(id));
  return Object.freeze({
    works: unavailableIds.length ? Object.freeze([]) : canonicalChainedSelectWorks(freshWorks),
    unavailableIds: Object.freeze(unavailableIds)
  });
}
