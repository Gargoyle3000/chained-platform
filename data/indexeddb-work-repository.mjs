export const INDEXEDDB_BOUNDARY = Object.freeze({ databaseName: "chained-works", version: 1, objectStoreName: "works", migrationMarker: null });

export function createIndexedDbWorkRepository(store = globalThis.ChainedWorkStore) {
  if (!store) throw new Error("IndexedDB Work storage is unavailable.");
  return Object.freeze({
    mode: "prototype",
    initialise: () => store.initialiseDatabase(),
    listManagedProfiles: async () => [],
    listWorks: () => store.getAllWorks(),
    getWork: (id) => store.getWork(id),
    createWork: (record) => store.createWork(record),
    updateWork: (record) => store.updateWork(record),
    deleteWork: (id) => store.deleteWork(id),
    getPublishedWork: async (id) => {
      const work = await store.getWork(id);
      return work?.visibility === "published" ? work : null;
    }
  });
}

