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
      recorded = body.cleanup_complete === true;
      return {};
    },
  }));
  const body = await responseJson(response);
  assert(response.status === 200 && body.cleanup_status === "succeeded" && recorded);
});

Deno.test("unpublish reports partial cleanup while Work remains hidden", async () => {
  let recorded = false;
  const response = await handleUnpublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name, body) => {
      if (name === "service_begin_work_unpublication") return running;
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
    rpc: async (name) => name === "service_begin_work_unpublication" ? running : {},
  }));
  const text = await response.text();
  assert(!text.includes("owner/work") && !text.toLowerCase().includes("token"));
});

