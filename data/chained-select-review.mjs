function orderedIds(values = []) {
  return [...new Set((values || []).filter((value) => typeof value === "string" && value.trim()))];
}

export async function revalidateChainedSelectWorks({ repository, reviewWorks = [], selectedIds = [] } = {}) {
  if (!repository || typeof repository.listArchivedSelectWorks !== "function") throw new Error("repository unavailable");

  const selected = orderedIds(selectedIds);
  const freshWorks = await repository.listArchivedSelectWorks(selected);
  const freshById = new Map((freshWorks || []).map((work) => [work?.id, work]).filter(([id]) => typeof id === "string"));
  const unavailableIds = selected.filter((id) => !freshById.has(id));
  const selectedIdsAfterValidation = selected.filter((id) => freshById.has(id));
  const selectedSet = new Set(selected);
  const unavailableSet = new Set(unavailableIds);
  const currentById = new Map((reviewWorks || []).map((work) => [work?.id, work]).filter(([id]) => typeof id === "string"));

  const works = (reviewWorks || [])
    .filter((work) => !unavailableSet.has(work?.id))
    .map((work) => selectedSet.has(work?.id) ? freshById.get(work.id) : work)
    .filter(Boolean);

  selectedIdsAfterValidation.forEach((id) => {
    if (!currentById.has(id)) works.push(freshById.get(id));
  });

  return Object.freeze({
    works: Object.freeze(works),
    selectedIds: Object.freeze(selectedIdsAfterValidation),
    unavailableIds: Object.freeze(unavailableIds)
  });
}
