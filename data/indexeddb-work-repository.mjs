export const INDEXEDDB_BOUNDARY = Object.freeze({ databaseName: "chained-works", version: 1, objectStoreName: "works", migrationMarker: null });

export function createIndexedDbWorkRepository(store = globalThis.ChainedWorkStore) {
  if (!store) throw new Error("IndexedDB Work storage is unavailable.");
  return Object.freeze({
    mode: "prototype",
    initialise: () => store.initialiseDatabase(),
    listManagedProfiles: async () => [],
    listWorks: () => store.getAllWorks(),
    getWork: (id) => store.getWork(id),
    async publicationReadiness(id) {
      const work = await store.getWork(id);
      const images = work?.images || [];
      const ready = images.length > 0 && images.every((image) => image.uploadStatus === "ready") && images.filter((image) => image.isCover).length === 1;
      return Object.freeze({ state: ready ? "ready" : "prerequisite_invalid", totalImages: images.length, readyImages: ready ? images.length : 0, processingImages: 0, failedImages: 0 });
    },
    createWork: (record) => store.createWork(record),
    updateWork: (record) => store.updateWork(record),
    deleteWork: (id) => store.deleteWork(id),
    getPublishedWork: async (id) => {
      const work = await store.getWork(id);
      return work?.visibility === "published" ? work : null;
    }
  });
}
