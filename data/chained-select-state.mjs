export const CHAINED_SELECT_MAX_WORKS = 20;
export const CHAINED_SELECT_MAX_IMAGES = 40;
export const CHAINED_SELECT_SESSION_KEY = "chained-select-v1";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ids(values) {
  return [...new Set((values || []).filter((value) => typeof value === "string" && value.trim()))];
}

export function createChainedSelectState(workIds = [], selectedIds = workIds) {
  const available = new Set(ids(workIds));
  const selected = ids(selectedIds).filter((id) => available.has(id));

  const indexOf = (workId) => selected.indexOf(workId);

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

export function chainedSelectLimit(works = []) {
  const selectedWorks = [...(works || [])];
  const imageCount = selectedWorks.reduce((count, work) => count + (work?.images?.length || 0), 0);
  return Object.freeze({
    workCount: selectedWorks.length,
    imageCount,
    valid: selectedWorks.length > 0 && selectedWorks.length <= CHAINED_SELECT_MAX_WORKS && imageCount <= CHAINED_SELECT_MAX_IMAGES
  });
}

export function createChainedSelectSession({ workIds, title = "", source = "filter" } = {}) {
  const sourceIds = ids(workIds);
  if (!sourceIds.length || !["project", "filter"].includes(source)) return null;
  return Object.freeze({
    version: 1,
    source,
    title: text(title).slice(0, 180),
    workIds: Object.freeze(sourceIds)
  });
}

export function writeChainedSelectSession(storage, value) {
  const session = createChainedSelectSession(value);
  if (!session || !storage?.setItem) return false;
  try {
    storage.setItem(CHAINED_SELECT_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function readChainedSelectSession(storage) {
  if (!storage?.getItem) return null;
  try {
    return createChainedSelectSession(JSON.parse(storage.getItem(CHAINED_SELECT_SESSION_KEY)));
  } catch {
    return null;
  }
}
