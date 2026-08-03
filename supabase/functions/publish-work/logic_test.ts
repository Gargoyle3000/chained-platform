import { MediaError } from "../_shared/work-media.ts";
import {
  assert,
  dependencies,
  IMAGE_ID,
  OPERATION_ID,
  post,
  responseJson,
  WORK_ID,
} from "../_shared/work-media-test-helpers.ts";
import { handlePublishWork } from "./logic.ts";

const image = {
  work_image_id: IMAGE_ID,
  private_object_path: `owner/work/${IMAGE_ID}/original.jpg`,
  public_object_path: `owner/work/revision/${IMAGE_ID}.jpg`,
  mime_type: "image/jpeg",
  file_size: 4,
  copy_status: "pending",
};

const runningClaim = { operation_id: OPERATION_ID, status: "running", idempotent: false, images: [image] };

Deno.test("publish rejects non-POST, malformed JSON, and malformed UUID", async () => {
  assert((await handlePublishWork(new Request("http://local.test"), dependencies())).status === 405);
  assert((await handlePublishWork(post("{"), dependencies())).status === 400);
  assert((await handlePublishWork(post({ work_id: "bad" }), dependencies())).status === 400);
});

Deno.test("publish rejects missing, invalid, inactive, unrelated, and revoked sessions", async () => {
  const missing = post({ work_id: WORK_ID });
  missing.headers.delete("authorization");
  assert((await handlePublishWork(missing, dependencies())).status === 401);
  for (const [token, status] of [["invalid", 401], ["inactive", 403], ["unrelated", 403], ["revoked", 403]] as const) {
    assert((await handlePublishWork(post({ work_id: WORK_ID }, token), dependencies())).status === status);
  }
});

Deno.test("publish rejects oversized request bodies", async () => {
  const response = await handlePublishWork(post(JSON.stringify({ work_id: WORK_ID, padding: "x".repeat(5000) })), dependencies());
  assert(response.status === 413);
});

Deno.test("publish surfaces no-image, missing-cover, and unready-image rejections safely", async () => {
  for (const code of ["no_images", "missing_cover", "unready_image"]) {
    const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
      rpc: async () => { throw new MediaError(422, code); },
    }));
    const body = await responseJson(response);
    assert(response.status === 422 && body.error === code);
  }
});

Deno.test("publish succeeds sequentially for a direct owner", async () => {
  const calls: string[] = [];
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name) => {
      calls.push(name);
      return name === "service_claim_work_publication" ? runningClaim : {};
    },
  }));
  assert(response.status === 200);
  assert(calls.includes("service_record_publication_copy") && calls.includes("service_finalize_work_publication"));
});

Deno.test("publish succeeds for a valid gallery delegate", async () => {
  const response = await handlePublishWork(post({ work_id: WORK_ID }, "delegate"), dependencies({
    rpc: async (name) => name === "service_claim_work_publication" ? runningClaim : {},
  }));
  assert(response.status === 200);
});

Deno.test("publish cleans up a midway copy failure and records failure", async () => {
  const second = { ...image, work_image_id: "55555555-5555-4555-8555-555555555555", public_object_path: "owner/work/revision/second.jpg" };
  let uploads = 0;
  let removed = false;
  let failureRecorded = false;
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name) => {
      if (name === "service_claim_work_publication") return { ...runningClaim, images: [image, second] };
      if (name === "service_fail_work_publication") failureRecorded = true;
      return {};
    },
    upload: async () => {
      uploads += 1;
      if (uploads === 2) throw new MediaError(502, "copy_failed");
    },
    remove: async (_bucket, paths) => {
      removed = paths.length >= 1;
      return true;
    },
  }));
  assert(response.status === 502 && removed && failureRecorded);
});

Deno.test("publish retains cleanup-pending state when failed-copy cleanup is incomplete", async () => {
  let cleanupStateRecorded = false;
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name, body) => {
      if (name === "service_claim_work_publication") return runningClaim;
      if (name === "service_fail_work_publication") cleanupStateRecorded = body.cleanup_complete === false;
      return {};
    },
    upload: async () => { throw new MediaError(502, "copy_failed"); },
    remove: async () => false,
  }));
  assert(response.status === 502 && cleanupStateRecorded);
});

Deno.test("publish duplicate successful retry creates no copies", async () => {
  let uploaded = false;
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async () => ({ status: "succeeded", idempotent: true, images: [] }),
    upload: async () => { uploaded = true; },
  }));
  const body = await responseJson(response);
  assert(response.status === 200 && body.idempotent === true && !uploaded);
});

Deno.test("publish conflicting operation returns a sanitized conflict", async () => {
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async () => { throw new MediaError(409, "conflicting_operation"); },
  }));
  const body = await responseJson(response);
  assert(response.status === 409 && body.error === "conflicting_operation");
});

Deno.test("publish rejects unsupported media and never exposes paths or secrets", async () => {
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name) => name === "service_claim_work_publication"
      ? { ...runningClaim, images: [{ ...image, mime_type: "image/gif" }] }
      : {},
  }));
  const text = await response.text();
  assert(response.status === 422);
  assert(!text.includes("owner/work") && !text.toLowerCase().includes("token") && !text.toLowerCase().includes("key"));
});

