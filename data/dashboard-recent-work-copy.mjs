export const RECENT_WORKS_LIMIT = 10;
export const RECENT_ITEMS_STEP = 10;

export function nextRecentItemsCount(visibleCount, totalCount) {
  const visible = Math.max(0, Number.parseInt(visibleCount, 10) || 0);
  const total = Math.max(0, Number.parseInt(totalCount, 10) || 0);
  return Math.min(total, visible + RECENT_ITEMS_STEP);
}

export function recentWorksCountLabel(totalCount, visibleCount = totalCount) {
  const total = Math.max(0, Number.parseInt(totalCount, 10) || 0);
  const visible = Math.min(total, Math.max(0, Number.parseInt(visibleCount, 10) || 0));
  if (visible < total) return `${visible} OF ${total}`;
  return `${total} ${total === 1 ? "WORK" : "WORKS"}`;
}
