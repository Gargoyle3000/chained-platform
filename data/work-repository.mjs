import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { createIndexedDbWorkRepository } from "./indexeddb-work-repository.mjs";
import { createSupabaseWorkRepository } from "./supabase-work-repository.mjs";

export function selectWorkRepository(runtime, store = globalThis.ChainedWorkStore) {
  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) return createIndexedDbWorkRepository(store);
  if (runtime.mode === FRONTEND_MODES.SUPABASE && runtime.client) return createSupabaseWorkRepository(runtime.client, runtime.config);
  throw new Error("Work repository mode is invalid.");
}

export async function getWorkRepository() {
  const runtime = await getFrontendRuntime();
  return Object.freeze({ runtime, repository: selectWorkRepository(runtime) });
}

export async function getPrototypeWorkCount(store = globalThis.ChainedWorkStore) {
  if (!store) return 0;
  if (typeof globalThis.indexedDB?.databases !== "function") return 0;
  const databases = await globalThis.indexedDB.databases();
  if (!databases.some((database) => database.name === "chained-works")) return 0;
  await store.initialiseDatabase();
  return (await store.getAllWorks()).length;
}
