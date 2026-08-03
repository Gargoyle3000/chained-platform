import { compareDiscoverChronology } from "./public-work-mapping.mjs";

export const PREFERRED_ARTIST_GAP = 4;

export function spreadDiscoverWorks(items, preferredGap = PREFERRED_ARTIST_GAP) {
  const remaining = [...(items || [])].sort(compareDiscoverChronology);
  const ordered = [];
  const recentArtists = [];
  const gap = Math.max(0, Number.parseInt(preferredGap, 10) || 0);

  while (remaining.length) {
    let index = remaining.findIndex(
      (item) => !recentArtists.includes(item.artistKey)
    );

    if (index < 0) {
      const previousArtist = ordered.at(-1)?.artistKey;
      index = remaining.findIndex((item) => item.artistKey !== previousArtist);
    }

    if (index < 0) index = 0;

    const [selected] = remaining.splice(index, 1);
    ordered.push(selected);
    recentArtists.push(selected.artistKey);
    if (recentArtists.length > gap) recentArtists.shift();
  }

  return ordered;
}

export function createDiscoverBatchState(items, batchSize = 12) {
  const ordered = [...(items || [])];
  const size = Math.max(1, Number.parseInt(batchSize, 10) || 12);
  let visibleCount = 0;

  return Object.freeze({
    next() {
      const start = visibleCount;
      visibleCount = Math.min(ordered.length, visibleCount + size);
      return Object.freeze({
        appended: ordered.slice(start, visibleCount),
        visible: ordered.slice(0, visibleCount),
        hasMore: visibleCount < ordered.length
      });
    },
    visible() {
      return ordered.slice(0, visibleCount);
    }
  });
}
