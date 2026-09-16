export function createDiscoverArchiveState(repository, memberships = []) {
  const originsByWork = new Map((memberships || []).map((item) => (
    typeof item === "string"
      ? [item, "saved"]
      : [item?.workId, item?.origin === "managed" ? "managed" : "saved"]
  )));

  return Object.freeze({
    isSaved(workId) {
      return originsByWork.has(workId);
    },

    isManaged(workId) {
      return originsByWork.get(workId) === "managed";
    },

    async toggle(workId) {
      if (originsByWork.get(workId) === "managed") return true;
      if (originsByWork.has(workId)) {
        await repository.removeWork(workId);
        originsByWork.delete(workId);
        return false;
      }

      await repository.saveWork(workId);
      originsByWork.set(workId, "saved");
      return true;
    }
  });
}
