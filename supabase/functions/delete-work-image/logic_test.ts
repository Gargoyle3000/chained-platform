import {
  assert,
  dependencies,
  IMAGE_ID,
  post,
  responseJson,
} from "../_shared/work-media-test-helpers.ts";
import { handleDeleteWorkImage } from "./logic.ts";

const deleting = {
  status: "deleting",
  idempotent: false,
  private_object_path: "owner/work/image/original.jpg",
  public_object_path: null,
};

Deno.test("image deletion rejects non-POST and malformed input", async () => {
  assert((await handleDeleteWorkImage(new Request("http://local.test"), dependencies())).status === 405);
  assert((await handleDeleteWorkImage(post("{"), dependencies())).status === 400);
  assert((await handleDeleteWorkImage(post({ work_image_id: "bad" }), dependencies())).status === 400);
});

Deno.test("image deletion rejects unauthenticated and unauthorized callers", async () => {
  const missing = post({ work_image_id: IMAGE_ID });
  missing.headers.delete("authorization");
  assert((await handleDeleteWorkImage(missing, dependencies())).status === 401);
  for (const token of ["inactive", "unrelated", "revoked"]) {
    assert((await handleDeleteWorkImage(post({ work_image_id: IMAGE_ID }, token), dependencies())).status === 403);
  }
});

Deno.test("image deletion safely removes an only image", async () => {
  const buckets: string[] = [];
  const response = await handleDeleteWorkImage(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name) => name === "service_begin_work_image_deletion" ? deleting : {},
    remove: async (bucket) => { buckets.push(bucket); return true; },
  }));
  const body = await responseJson(response);
  assert(response.status === 200 && body.status === "deleted" && buckets.length === 1);
});

Deno.test("image deletion removes an unexpected stale public copy", async () => {
  const buckets: string[] = [];
  const response = await handleDeleteWorkImage(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name) => name === "service_begin_work_image_deletion"
      ? { ...deleting, public_object_path: "owner/work/revision/image.jpg" }
      : {},
    remove: async (bucket) => { buckets.push(bucket); return true; },
  }));
  assert(response.status === 200 && buckets.length === 2);
});

Deno.test("image deletion removes its exact private preview together with the original", async () => {
  let privatePaths: string[] = [];
  const response = await handleDeleteWorkImage(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name) => name === "service_begin_work_image_deletion"
      ? { ...deleting, preview_object_path: "owner/work/image/preview.webp" }
      : {},
    remove: async (bucket, paths) => {
      if (bucket === "work-originals") privatePaths = paths;
      return true;
    },
  }));
  assert(response.status === 200 && JSON.stringify(privatePaths) === JSON.stringify([
    "owner/work/image/original.jpg", "owner/work/image/preview.webp",
  ]));
});

Deno.test("image deletion records cleanup failure and remains retryable", async () => {
  let recorded = false;
  const response = await handleDeleteWorkImage(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name, body) => {
      if (name === "service_begin_work_image_deletion") return deleting;
      recorded = body.cleanup_complete === false;
      return {};
    },
    remove: async () => false,
  }));
  const body = await responseJson(response);
  assert(response.status === 200 && body.status === "cleanup_pending" && recorded);
});

Deno.test("image deletion repeated success is idempotent", async () => {
  let removed = false;
  const response = await handleDeleteWorkImage(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async () => ({ status: "deleted", idempotent: true }),
    remove: async () => { removed = true; return true; },
  }));
  const body = await responseJson(response);
  assert(body.idempotent === true && !removed);
});

Deno.test("image deletion response contains no object path or secret", async () => {
  const response = await handleDeleteWorkImage(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name) => name === "service_begin_work_image_deletion" ? deleting : {},
  }));
  const text = await response.text();
  assert(!text.includes("owner/work") && !text.toLowerCase().includes("token"));
});
