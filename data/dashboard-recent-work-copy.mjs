export const RECENT_WORKS_LIMIT = 10;

export function recentWorksCountLabel(totalCount, visibleCount = totalCount) {
  const total = Math.max(0, Number.parseInt(totalCount, 10) || 0);
  const visible = Math.min(total, Math.max(0, Number.parseInt(visibleCount, 10) || 0));
  if (visible < total) return `${visible} OF ${total}`;
  return `${total} ${total === 1 ? "WORK" : "WORKS"}`;
}
