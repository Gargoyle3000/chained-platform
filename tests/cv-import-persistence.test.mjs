import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSupabaseCvRepository } from "../data/cv-repository.mjs";
import { createCvImportPersistenceFlow } from "../data/cv-import-persistence.mjs";

const PROFILE_ID = "93200000-0000-4000-8000-000000000001";
const ENTRY = Object.freeze({
  categoryType: "education",
  yearLabel: "2020",
  title: "BA Fine Arts",
  organization: null,
  locationText: null,
  url: null,
  sourceActivityId: null
});

test("repository submits one named atomic RPC payload and maps only its safe summary", async () => {
  const calls = [];
  const repository = createSupabaseCvRepository({
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: {
          submitted_count: 2,
          inserted_count: 1,
          duplicate_count: 1,
          private_row: "ignored"
        },
        error: null
      };
    }
  });

  const result = await repository.importManualEntries(PROFILE_ID, [ENTRY, ENTRY]);
  assert.deepEqual(calls, [{
    name: "import_cv_entries",
    args: {
      target_profile_id: PROFILE_ID,
      selected_entries: [ENTRY, ENTRY]
    }
  }]);
  assert.deepEqual(result, {
    submittedCount: 2,
    insertedCount: 1,
    duplicateCount: 1
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal("private_row" in result, false);
});

test("repository rejects empty, oversized, failed, and malformed persistence responses", async () => {
  const repository = createSupabaseCvRepository({
    async rpc() {
      return { data: null, error: { code: "42501" } };
    }
  });
  await assert.rejects(() => repository.importManualEntries(PROFILE_ID, []), /SELECT CV ENTRIES TO ADD/);
  await assert.rejects(
    () => repository.importManualEntries(PROFILE_ID, Array.from({ length: 501 }, () => ENTRY)),
    /SELECT CV ENTRIES TO ADD/
  );
  await assert.rejects(() => repository.importManualEntries(PROFILE_ID, [ENTRY]), /CV COULD NOT BE ADDED/);

  const malformed = createSupabaseCvRepository({
    async rpc() {
      return {
        data: { submitted_count: 1, inserted_count: 1, duplicate_count: 1 },
        error: null
      };
    }
  });
  await assert.rejects(() => malformed.importManualEntries(PROFILE_ID, [ENTRY]), /CV COULD NOT BE ADDED/);
});

test("persistence flow is single-flight and success waits for authoritative reload handling", async () => {
  const events = [];
  let release;
  let calls = 0;
  const flow = createCvImportPersistenceFlow({
    persist: async () => {
      calls += 1;
      await new Promise((resolve) => { release = resolve; });
      return { submittedCount: 1, insertedCount: 1, duplicateCount: 0 };
    },
    onPending: () => events.push("pending"),
    onSuccess: async () => events.push("success"),
    onFailure: () => events.push("failure"),
    onActiveChange: (active) => events.push(active ? "active" : "idle")
  });

  const first = flow.submit(PROFILE_ID, [ENTRY]);
  assert.equal(flow.active, true);
  assert.equal(await flow.submit(PROFILE_ID, [ENTRY]), false);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, true);
  assert.equal(flow.active, false);
  assert.deepEqual(events, ["active", "pending", "idle", "success"]);
});

test("persistence failure retains caller state and never retries automatically", async () => {
  const review = { edited: "retained", selected: true };
  const events = [];
  let calls = 0;
  const flow = createCvImportPersistenceFlow({
    persist: async () => {
      calls += 1;
      throw new Error("database");
    },
    onPending: () => events.push("pending"),
    onSuccess: () => events.push("success"),
    onFailure: () => events.push(`failure:${review.edited}:${review.selected}`),
    onActiveChange: (active) => events.push(active ? "active" : "idle")
  });

  assert.equal(await flow.submit(PROFILE_ID, [ENTRY]), true);
  assert.equal(calls, 1);
  assert.deepEqual(events, ["active", "pending", "idle", "failure:retained:true"]);
});

test("migration exposes one named authenticated wrapper around a locked strict manual-entry transaction", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260909191536_cv_import_atomic_add.sql", import.meta.url),
    "utf8"
  );

  assert.match(migration, /create function private\.import_cv_entries\([\s\S]*target_profile_id uuid,[\s\S]*selected_entries jsonb/);
  assert.match(migration, /private\.can_manage_cv_owner\(target_profile_id\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /perform private\.ensure_fixed_cv_categories\(target_profile_id\)/);
  assert.match(migration, /source_activity_id,[\s\S]*select[\s\S]*null,/);
  assert.match(migration, /submitted_count < 1 or submitted_count > 500/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /create function public\.import_cv_entries\([\s\S]*security invoker/);
  assert.match(migration, /grant execute on function public\.import_cv_entries\(uuid, jsonb\)[\s\S]*to authenticated/);
  assert.match(migration, /revoke all on function public\.import_cv_entries\(uuid, jsonb\)[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(migration, /profile_activities\s*\(|presentation_(?:participants|works)|activity_occurrences\s*\(/);
});
