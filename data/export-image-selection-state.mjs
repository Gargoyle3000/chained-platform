function orderedEligibleImages(work) {
  return [...(work?.images || [])]
    .filter((image) => image?.id && image.uploadStatus === "ready")
    .sort((a, b) => Number(a.order ?? a.sortOrder ?? 0) - Number(b.order ?? b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id), "en"));
}

function defaultImageId(work) {
  const images = orderedEligibleImages(work);
  return images.find((image) => image.isCover)?.id || images[0]?.id || null;
}

/** Browser-local export selection. It never mutates Work or media records. */
export function createExportImageSelectionState(works = []) {
  const available = new Map(works.filter((work) => work?.id).map((work) => [work.id, orderedEligibleImages(work)]));
  const selected = new Map([...available].map(([workId, images]) => [workId, new Set([defaultImageId({ images })].filter(Boolean))]));

  function valid(workId, imageId) {
    return available.get(workId)?.some((image) => image.id === imageId) || false;
  }

  return Object.freeze({
    count(workId) { return selected.get(workId)?.size || 0; },
    ids(workId) { return orderedEligibleImages({ images: available.get(workId) }).filter((image) => selected.get(workId)?.has(image.id)).map((image) => image.id); },
    selectedImages(work) { return this.ids(work?.id).map((id) => orderedEligibleImages(work).find((image) => image.id === id)).filter(Boolean); },
    toggle(workId, imageId) {
      if (!valid(workId, imageId)) return false;
      const current = selected.get(workId);
      if (current.has(imageId)) {
        if (current.size <= 1) return false;
        current.delete(imageId);
      } else current.add(imageId);
      return true;
    }
  });
}

export function applyExportImageSelection(works = [], selection) {
  return Object.freeze((works || []).map((work) => Object.freeze({
    ...work,
    images: Object.freeze((selection?.selectedImages?.(work) || []).sort((a, b) => Number(a.order ?? a.sortOrder ?? 0) - Number(b.order ?? b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id), "en")))
  })).filter((work) => work.images.length));
}
