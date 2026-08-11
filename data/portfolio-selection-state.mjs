export function createPortfolioSelectionState(workIds = []) {
  const available = new Set(workIds.filter(Boolean));
  const selected = [];

  function indexOf(workId) {
    return selected.indexOf(workId);
  }

  return Object.freeze({
    deselect(workId) {
      const index = indexOf(workId);
      if (index < 0) return false;
      selected.splice(index, 1);
      return true;
    },
    has: (workId) => indexOf(workId) >= 0,
    ids: () => [...selected],
    move(workId, direction) {
      const index = indexOf(workId);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= selected.length) return false;
      [selected[index], selected[destination]] = [selected[destination], selected[index]];
      return true;
    },
    select(workId) {
      if (!available.has(workId) || indexOf(workId) >= 0) return false;
      selected.push(workId);
      return true;
    }
  });
}
