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
  staging_object_path: `owner/work/${IMAGE_ID}/public-derivatives/small.webp`,
  public_object_path: `owner/work/revision/${IMAGE_ID}/small.webp`,
  rendition_key: "small",
  mime_type: "image/webp",
  file_size: 12,
  copy_status: "pending",
};

const runningClaim = { operation_id: OPERATION_ID, status: "running", idempotent: false, images: [image] };
const large = { ...image, rendition_key: "large", staging_object_path: `owner/work/${IMAGE_ID}/public-derivatives/large.webp`, public_object_path: `owner/work/revision/${IMAGE_ID}/large.webp` };

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
      return name === "service_claim_work_derivative_publication" ? runningClaim : {};
    },
  }));
  assert(response.status === 200);
  assert(calls.includes("service_record_publication_derivative_copy") && calls.includes("service_finalize_work_publication"));
});

Deno.test("publish succeeds for a valid gallery delegate", async () => {
  const response = await handlePublishWork(post({ work_id: WORK_ID }, "delegate"), dependencies({
    rpc: async (name) => name === "service_claim_work_derivative_publication" ? runningClaim : {},
  }));
  assert(response.status === 200);
});

Deno.test("publish cleans up a midway copy failure and records failure", async () => {
  const second = { ...image, work_image_id: "55555555-5555-4555-8555-555555555555", public_object_path: "owner/work/revision/second/small.webp" };
  let uploads = 0;
  let removed = false;
  let failureRecorded = false;
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name) => {
      if (name === "service_claim_work_derivative_publication") return { ...runningClaim, images: [image, second] };
      if (name === "service_fail_work_derivative_publication") failureRecorded = true;
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

Deno.test("publish copies each exact SMALL and LARGE staging object and records each rendition", async () => {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const buckets: string[] = [];
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name, body) => { calls.push({ name, body }); return name === "service_claim_work_derivative_publication" ? { ...runningClaim, images: [image, large] } : {}; },
    download: async (bucket, path) => { buckets.push(`${bucket}:${path}`); return { bytes: new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]), mimeType: "image/webp", size: 12 }; },
  }));
  assert(response.status === 200 && buckets.every((value) => value.startsWith("work-derivative-staging:")));
  assert(calls.filter((call) => call.name === "service_record_publication_derivative_copy").map((call) => call.body.target_rendition).join(",") === "small,large");
});

Deno.test("candidate cleanup is limited to copied derivative paths when LARGE fails", async () => {
  let removed: string[] = [];
  let uploads = 0;
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name) => name === "service_claim_work_derivative_publication" ? { ...runningClaim, images: [image, large] } : {},
    upload: async () => { uploads += 1; if (uploads === 2) throw new MediaError(502, "copy_failed"); },
    remove: async (_bucket, paths) => { removed = paths; return true; },
  }));
  assert(response.status === 502 && removed.length === 1 && removed[0] === image.public_object_path);
});

Deno.test("a retry after candidate failure uses a fresh claim and does not reuse prior paths", async () => {
  const first = { ...image, public_object_path: "owner/work/revision-a/image/small.webp" };
  const second = { ...image, public_object_path: "owner/work/revision-b/image/small.webp" };
  let attempts = 0;
  const paths: string[] = [];
  const deps = dependencies({
    rpc: async (name) => { if (name !== "service_claim_work_derivative_publication") return {}; attempts += 1; return { ...runningClaim, operation_id: attempts === 1 ? OPERATION_ID : "55555555-5555-4555-8555-555555555555", images: [attempts === 1 ? first : second] }; },
    upload: async (_bucket, path) => { paths.push(path); if (attempts === 1) throw new MediaError(502, "copy_failed"); },
  });
  assert((await handlePublishWork(post({ work_id: WORK_ID }), deps)).status === 502);
  assert((await handlePublishWork(post({ work_id: WORK_ID }), deps)).status === 200);
  assert(paths.includes(first.public_object_path) && paths.includes(second.public_object_path) && first.public_object_path !== second.public_object_path);
});

Deno.test("publish retains cleanup-pending state when failed-copy cleanup is incomplete", async () => {
  let cleanupStateRecorded = false;
  const response = await handlePublishWork(post({ work_id: WORK_ID }), dependencies({
    rpc: async (name, body) => {
      if (name === "service_claim_work_derivative_publication") return runningClaim;
      if (name === "service_fail_work_derivative_publication") cleanupStateRecorded = body.cleanup_complete === false;
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
    rpc: async (name) => name === "service_claim_work_derivative_publication"
      ? { ...runningClaim, images: [{ ...image, mime_type: "image/gif" }] }
      : {},
  }));
  const text = await response.text();
  assert(response.status === 422);
  assert(!text.includes("owner/work") && !text.toLowerCase().includes("token") && !text.toLowerCase().includes("key"));
});
