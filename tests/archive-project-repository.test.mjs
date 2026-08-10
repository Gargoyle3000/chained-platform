import test from "node:test";
import assert from "node:assert/strict";
import { createArchiveRepository } from "../data/archive-repository.mjs";

const IDS = Object.freeze({
  project: "11111111-1111-4111-8111-111111111111",
  workA: "22222222-2222-4222-8222-222222222222",
  workB: "33333333-3333-4333-8333-333333333333",
  publisher: "44444444-4444-4444-8444-444444444444",
  collection: "55555555-5555-4555-8555-555555555555"
});

function queryResult(data, error = null) {
  const builder = {
    order() { return builder; },
    eq() { return builder; },
    select() { return builder; },
    single() { return Promise.resolve({ data, error }); },
    then(resolve) { resolve({ data, error }); }
  };
  return builder;
}

function client(rows = {}) {
  const calls = [];
  return {
    calls,
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: null } }) }) },
    from(table) {
      calls.push(table);
      const tableRows = rows[table] || [];
      return {
        select() { return queryResult(tableRows); },
        insert(payload) { calls.push({ insert: [table, payload] }); return queryResult(rows.createdProject || null); },
        update(payload) { calls.push({ update: [table, payload] }); return queryResult(rows.updatedProject || null); },
        delete() { calls.push({ delete: table }); return queryResult(null); }
      };
    },
    async rpc(name, args) {
      calls.push({ rpc: [name, args] });
      return { data: rows.rpcData || true, error: rows.rpcError || null };
    }
  };
}

test("Project repository lists private Projects, items and publications in batches", async () => {
  const supabase = client({
    archive_projects: [{ id: IDS.project, title: "  Sequence ", description: "  Private note ", publisher_profile_id: IDS.publisher }],
    archive_project_items: [
      { project_id: IDS.project, work_id: IDS.workB, position: 1 },
      { project_id: IDS.project, work_id: IDS.workA, position: 0 }
    ],
    curated_collections: [{ id: IDS.collection, project_id: IDS.project, publisher_profile_id: IDS.publisher, status: "published", published_at: "2026-08-10T00:00:00Z" }]
  });
  const repository = createArchiveRepository(supabase, {});
  assert.deepEqual(await repository.listProjects(), [{ id: IDS.project, title: "Sequence", description: "Private note", publisherProfileId: IDS.publisher, createdAt: null, updatedAt: null }]);
  assert.deepEqual((await repository.listProjectItems()).map((item) => [item.workId, item.position]), [[IDS.workB, 1], [IDS.workA, 0]]);
  assert.deepEqual(await repository.listProjectPublications(), [{ id: IDS.collection, projectId: IDS.project, publisherProfileId: IDS.publisher, status: "published", publishedAt: "2026-08-10T00:00:00Z" }]);
  assert.deepEqual(supabase.calls, ["archive_projects", "archive_project_items", "curated_collections"]);
});

test("Project mutations use bounded project RPCs and preserve one Work in many Projects", async () => {
  const supabase = client();
  const repository = createArchiveRepository(supabase, {});
  await repository.addProjectWork(IDS.project, IDS.workA);
  await repository.reorderProjectWorks(IDS.project, [IDS.workB, IDS.workA]);
  await repository.removeProjectWork(IDS.project, IDS.workA);
  await repository.publishProject(IDS.project, IDS.publisher);
  await repository.depublishProject(IDS.project);
  assert.deepEqual(supabase.calls, [
    { rpc: ["add_archive_project_item", { target_project_id: IDS.project, target_work_id: IDS.workA }] },
    { rpc: ["reorder_archive_project_items", { target_project_id: IDS.project, ordered_work_ids: [IDS.workB, IDS.workA] }] },
    { rpc: ["remove_archive_project_item", { target_project_id: IDS.project, target_work_id: IDS.workA }] },
    { rpc: ["publish_archive_project", { target_project_id: IDS.project, target_publisher_profile_id: IDS.publisher }] },
    { rpc: ["depublish_archive_project", { target_project_id: IDS.project }] }
  ]);
});

test("Project input and private failures are sanitized before or after a request", async () => {
  const supabase = client({ rpcError: { message: "private database detail" } });
  const repository = createArchiveRepository(supabase, {});
  await assert.rejects(() => repository.createProject("   "), /ARCHIVE IS CURRENTLY UNAVAILABLE/);
  await assert.rejects(() => repository.reorderProjectWorks(IDS.project, [IDS.workA, "not-a-work"]), /ARCHIVE IS CURRENTLY UNAVAILABLE/);
  await assert.rejects(() => repository.addProjectWork(IDS.project, IDS.workA), /ARCHIVE IS CURRENTLY UNAVAILABLE/);
  assert.deepEqual(supabase.calls, [{ rpc: ["add_archive_project_item", { target_project_id: IDS.project, target_work_id: IDS.workA }] }]);
});
