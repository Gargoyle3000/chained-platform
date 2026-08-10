export function createDiscoverArchiveState(repository, archivedWorkIds = []) {
  const savedWorkIds = new Set(archivedWorkIds);

  return Object.freeze({
    isSaved(workId) {
      return savedWorkIds.has(workId);
    },

    async toggle(workId) {
      if (savedWorkIds.has(workId)) {
        await repository.removeWork(workId);
        savedWorkIds.delete(workId);
        return false;
      }

      await repository.saveWork(workId);
      savedWorkIds.add(workId);
      return true;
    }
  });
}
