import { MediaError } from "../_shared/work-media.ts";
import {
  assert,
  dependencies,
  IMAGE_ID,
  post,
  responseJson,
} from "../_shared/work-media-test-helpers.ts";
import { handleFinalizeWorkImageUpload } from "./logic.ts";

const context = {
  work_image_id: IMAGE_ID,
  object_path: `owner/work/${IMAGE_ID}/original.jpg`,
  mime_type: "image/jpeg",
  file_size: 4,
  upload_status: "reserved",
  verified: false,
};

Deno.test("finalize rejects non-POST requests", async () => {
  const response = await handleFinalizeWorkImageUpload(new Request("http://local.test"), dependencies());
  assert(response.status === 405);
});

Deno.test("finalize rejects a missing JWT", async () => {
  const request = post({ work_image_id: IMAGE_ID });
  request.headers.delete("authorization");
  const response = await handleFinalizeWorkImageUpload(request, dependencies());
  assert(response.status === 401);
});

Deno.test("finalize rejects an invalid JWT", async () => {
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }, "invalid"), dependencies());
  assert(response.status === 401);
});

Deno.test("finalize rejects inactive and unrelated callers", async () => {
  for (const token of ["inactive", "unrelated", "revoked"]) {
    const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }, token), dependencies());
    assert(response.status === 403);
  }
});

Deno.test("finalize rejects malformed UUID and JSON", async () => {
  assert((await handleFinalizeWorkImageUpload(post({ work_image_id: "bad" }), dependencies())).status === 400);
  assert((await handleFinalizeWorkImageUpload(post("{"), dependencies())).status === 400);
});

Deno.test("finalize rejects an oversized request", async () => {
  const response = await handleFinalizeWorkImageUpload(
    post(JSON.stringify({ work_image_id: IMAGE_ID, padding: "x".repeat(5000) })),
    dependencies(),
  );
  assert(response.status === 413);
});

Deno.test("finalize marks a valid direct-owner upload ready", async () => {
  const calls: string[] = [];
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name) => {
      calls.push(name);
      return name === "service_get_work_image_upload" ? context : { status: "ready" };
    },
  }));
  assert(response.status === 200);
  assert(calls.includes("service_mark_work_image_upload"));
});

Deno.test("finalize accepts a valid delegated caller", async () => {
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }, "delegate"), dependencies({
    rpc: async (name) => name === "service_get_work_image_upload" ? context : {},
  }));
  assert(response.status === 200);
});

Deno.test("finalize is idempotent for an already verified image", async () => {
  let downloaded = false;
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async () => ({ ...context, upload_status: "ready", verified: true }),
    download: async () => {
      downloaded = true;
      throw new Error("unexpected");
    },
  }));
  const body = await responseJson(response);
  assert(response.status === 200 && body.idempotent === true && !downloaded);
});

Deno.test("finalize records missing objects as failed", async () => {
  let failed = false;
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name, body) => {
      if (name === "service_get_work_image_upload") return context;
      failed = body.verified === false && body.failure_code === "object_missing";
      return {};
    },
    download: async () => { throw new MediaError(404, "object_missing"); },
  }));
  assert(response.status === 404 && failed);
});

Deno.test("finalize rejects size, MIME, and signature mismatches", async () => {
  const cases = [
    { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg", size: 3, code: "object_size_mismatch" },
    { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]), mimeType: "image/png", size: 4, code: "object_mime_mismatch" },
    { bytes: new Uint8Array([0x00, 0x00, 0x00, 0x00]), mimeType: "image/jpeg", size: 4, code: "object_signature_mismatch" },
  ];
  for (const testCase of cases) {
    const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
      rpc: async (name) => name === "service_get_work_image_upload" ? context : {},
      download: async () => testCase,
    }));
    const body = await responseJson(response);
    assert(response.status === 422 && body.error === testCase.code);
  }
});

Deno.test("finalize responses never expose media paths or credentials", async () => {
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name) => name === "service_get_work_image_upload" ? context : {},
  }));
  const text = await response.text();
  assert(!text.includes("original.jpg") && !text.toLowerCase().includes("token") && !text.toLowerCase().includes("key"));
});

