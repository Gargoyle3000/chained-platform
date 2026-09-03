import {
  assert,
  dependencies,
  OPERATION_ID,
  post,
  responseJson,
  WORK_ID,
} from "../_shared/work-media-test-helpers.ts";
import { handleUnpublishWork } from "./logic.ts";

const running = {
  operation_id: OPERATION_ID,
  status: "running",
  idempotent: false,
  images: [{ public_object_path: "owner/work/revision/image.jpg" }],
};

Deno.test("unpublish rejects non-POST and malformed input", async () => {
  assert((await handleUnpublishWork(new Request("http://local.test"), dependencies())).status === 405);
  assert((await handleUnpublishWork(post("{"), dependencies())).status === 400);
  assert((await handleUnpublishWork(post({ work_id: "bad" }), dependencies())).status === 400);
});

Deno.test("unpublish rejects unauthenticated, inactive, unrelated, and revoked callers", async () => {
  const missing = post({ work_id: WORK_ID });
  missing.headers.delete("authorization");
  assert((await handleUnpublishWork(missing, dependencies())).status === 401);
  for (const token of ["inactive", "unrelated", "revoked"]) {
    assert((await handleUnpublishWork(post({ work_id: WORK_ID }, token), dependencies())).status === 403);
  }
});

Deno.test("unpublish succeeds after complete public recall", async () => {
  let recorded = false;
  const response = await handleUnpublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name, body) => {
      if (name === "service_begin_work_unpublication") return running;
      if (name === "service_list_work_publication_cleanup_paths") return running.images;
      recorded = body.cleanup_complete === true;
      return {};
    },
  }));
  const body = await responseJson(response);
  assert(response.status === 200 && body.cleanup_status === "succeeded" && recorded);
});

Deno.test("published delete completes public cleanup before trusted soft deletion", async () => {
  const calls: string[] = [];
  const response = await handleUnpublishWork(post({ work_id: WORK_ID, delete_after_unpublish: true }), dependencies({
    rpc: async (name) => {
      calls.push(name);
      if (name === "service_begin_work_unpublication") return running;
      if (name === "service_list_work_publication_cleanup_paths") return running.images;
      return {};
    },
  }));
  const body = await responseJson(response);
  assert(response.status === 200 && body.status === "deleted" && body.deleted === true);
  assert(calls.join(",") === "service_begin_work_unpublication,service_list_work_publication_cleanup_paths,service_record_derivative_public_cleanup,service_soft_delete_unpublished_work");
});

Deno.test("published delete remains hidden but is not soft-deleted when public cleanup is pending", async () => {
  const calls: string[] = [];
  const response = await handleUnpublishWork(post({ work_id: WORK_ID, delete_after_unpublish: true }), dependencies({
    rpc: async (name) => {
      calls.push(name);
      if (name === "service_begin_work_unpublication") return running;
      if (name === "service_list_work_publication_cleanup_paths") return running.images;
      return {};
    },
    remove: async () => false,
  }));
  const body = await responseJson(response);
  assert(response.status === 200 && body.status === "draft" && body.cleanup_status === "cleanup_pending" && body.deleted === false);
  assert(!calls.includes("service_soft_delete_unpublished_work"));
});

Deno.test("published delete retry resumes the existing cleanup-pending operation", async () => {
  const calls: string[] = [];
  let removedPaths: string[] = [];
  const response = await handleUnpublishWork(post({ work_id: WORK_ID, delete_after_unpublish: true }), dependencies({
    rpc: async (name) => {
      calls.push(name);
      if (name === "service_begin_work_unpublication") return { ...running, status: "cleanup_pending", idempotent: true };
      if (name === "service_list_work_publication_cleanup_paths") return running.images;
      return {};
    },
    remove: async (_bucket, paths) => { removedPaths = paths; return true; },
  }));
  const body = await responseJson(response);
  assert(body.status === "deleted" && body.deleted === true && body.idempotent === true);
  assert(JSON.stringify(removedPaths) === JSON.stringify(["owner/work/revision/image.jpg"]));
  assert(calls.join(",") === "service_begin_work_unpublication,service_list_work_publication_cleanup_paths,service_record_derivative_public_cleanup,service_soft_delete_unpublished_work");
});

Deno.test("published delete retry finishes an already hidden Work without repeating public removal", async () => {
  const calls: string[] = [];
  let removed = false;
  const response = await handleUnpublishWork(post({ work_id: WORK_ID, delete_after_unpublish: true }), dependencies({
    rpc: async (name) => { calls.push(name); return { status: "already_hidden", idempotent: true, images: [] }; },
    remove: async () => { removed = true; return true; },
  }));
  const body = await responseJson(response);
  assert(body.status === "deleted" && body.idempotent === true && !removed);
  assert(calls.join(",") === "service_begin_work_unpublication,service_soft_delete_unpublished_work");
});

Deno.test("published delete exposes no cleanup detail if final soft deletion fails", async () => {
  const response = await handleUnpublishWork(post({ work_id: WORK_ID, delete_after_unpublish: true }), dependencies({
    rpc: async (name) => {
      if (name === "service_begin_work_unpublication") return running;
      if (name === "service_list_work_publication_cleanup_paths") return running.images;
      if (name === "service_soft_delete_unpublished_work") throw new Error("final deletion failed");
      return {};
    },
  }));
  const text = await response.text();
  assert(response.status === 500 && !text.includes("owner/work") && !text.includes("final deletion failed"));
});

Deno.test("unpublish reports partial cleanup while Work remains hidden", async () => {
  let recorded = false;
  const response = await handleUnpublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name, body) => {
      if (name === "service_begin_work_unpublication") return running;
      if (name === "service_list_work_publication_cleanup_paths") return running.images;
      recorded = body.cleanup_complete === false;
      return {};
    },
    remove: async () => false,
  }));
  const body = await responseJson(response);
  assert(response.status === 200 && body.status === "draft" && body.cleanup_status === "cleanup_pending" && recorded);
});

Deno.test("unpublish repeated retry is deterministic and performs no removal", async () => {
  let removed = false;
  const response = await handleUnpublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async () => ({ status: "succeeded", idempotent: true, images: [] }),
    remove: async () => { removed = true; return true; },
  }));
  const body = await responseJson(response);
  assert(body.idempotent === true && !removed);
});

Deno.test("unpublish response does not disclose recalled paths", async () => {
  const response = await handleUnpublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name) => name === "service_begin_work_unpublication" ? running : name === "service_list_work_publication_cleanup_paths" ? running.images : {},
  }));
  const text = await response.text();
  assert(!text.includes("owner/work") && !text.toLowerCase().includes("token"));
});

Deno.test("published delete rejects a non-boolean delete flag", async () => {
  const response = await handleUnpublishWork(post({ work_id: WORK_ID, delete_after_unpublish: "true" }), dependencies());
  assert(response.status === 400);
});
