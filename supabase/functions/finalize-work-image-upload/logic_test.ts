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

Deno.test("finalize sends trusted PNG dimensions only from the stored original", async () => {
  let marked: Record<string, unknown> = {};
  const png = new Uint8Array(24); png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 0); png.set([0,0,0,2,0,0,0,3],16);
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name, body) => { if (name === "service_get_work_image_upload") return { ...context, object_path: `owner/work/${IMAGE_ID}/original.png`, mime_type: "image/png", file_size: 24 }; marked = body; return {}; },
    download: async () => ({ bytes: png, mimeType: "image/png", size: 24 }),
  }));
  assert(response.status === 200 && marked.pixel_width === 2 && marked.pixel_height === 3);
});

Deno.test("finalize sends trusted JPEG and WebP dimensions only from stored originals", async () => {
  const cases = [
    {
      mimeType: "image/jpeg", extension: "jpg",
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, 0, 3, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      width: 2, height: 3,
    },
    {
      mimeType: "image/webp", extension: "webp",
      bytes: new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,0x56,0x50,0x38,0x58,0,0,0,0,0,0,0,0,1,0,0,2,0,0]),
      width: 2, height: 3,
    },
  ];
  for (const testCase of cases) {
    let marked: Record<string, unknown> = {};
    const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
      rpc: async (name, body) => {
        if (name === "service_get_work_image_upload") return { ...context, object_path: `owner/work/${IMAGE_ID}/original.${testCase.extension}`, mime_type: testCase.mimeType, file_size: testCase.bytes.byteLength };
        marked = body;
        return {};
      },
      download: async () => ({ bytes: testCase.bytes, mimeType: testCase.mimeType, size: testCase.bytes.byteLength }),
    }));
    assert(response.status === 200 && marked.pixel_width === testCase.width && marked.pixel_height === testCase.height);
  }
});

Deno.test("unparsed AVIF and malformed-but-accepted WebP keep the valid original ready without dimensions", async () => {
  const cases = [
    { mimeType: "image/avif", extension: "avif", bytes: new Uint8Array([0,0,0,16,0x66,0x74,0x79,0x70,0x61,0x76,0x69,0x66,0,0,0,0]) },
    { mimeType: "image/webp", extension: "webp", bytes: new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]) },
  ];
  for (const testCase of cases) {
    let marked: Record<string, unknown> = {};
    const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
      rpc: async (name, body) => {
        if (name === "service_get_work_image_upload") return { ...context, object_path: `owner/work/${IMAGE_ID}/original.${testCase.extension}`, mime_type: testCase.mimeType, file_size: testCase.bytes.byteLength };
        marked = body;
        return { status: "ready" };
      },
      download: async () => ({ bytes: testCase.bytes, mimeType: testCase.mimeType, size: testCase.bytes.byteLength }),
    }));
    assert(response.status === 200 && marked.verified === true && !("pixel_width" in marked) && !("pixel_height" in marked));
  }
});

Deno.test("finalize accepts a valid delegated caller", async () => {
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }, "delegate"), dependencies({
    rpc: async (name) => name === "service_get_work_image_upload" ? context : {},
  }));
  assert(response.status === 200);
});

Deno.test("finalize validates a reserved WebP preview before making a preview-aware upload ready", async () => {
  const previewContext = {
    ...context,
    preview_required: true,
    preview_object_path: `owner/work/${IMAGE_ID}/preview.webp`,
    preview_mime_type: "image/webp",
    preview_file_size: 12,
  };
  const downloaded: string[] = [];
  let markedPreviewReady = false;
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name, body) => {
      if (name === "service_get_work_image_upload") return previewContext;
      markedPreviewReady = body.preview_failure === false && body.verified === true;
      return {};
    },
    download: async (_bucket, path) => {
      downloaded.push(path);
      return path.endsWith("preview.webp")
        ? { bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), mimeType: "image/webp", size: 12 }
        : { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]), mimeType: "image/jpeg", size: 4 };
    },
  }));
  assert(response.status === 200 && downloaded.length === 2 && markedPreviewReady);
});

Deno.test("finalize fails a preview-aware upload without leaving it ready when the preview is invalid", async () => {
  const previewContext = {
    ...context,
    preview_required: true,
    preview_object_path: `owner/work/${IMAGE_ID}/preview.webp`,
    preview_mime_type: "image/webp",
    preview_file_size: 4,
  };
  let previewFailure = false;
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async (name, body) => {
      if (name === "service_get_work_image_upload") return previewContext;
      previewFailure = body.verified === false && body.preview_failure === true;
      return {};
    },
    download: async (_bucket, path) => path.endsWith("preview.webp")
      ? { bytes: new Uint8Array([0, 0, 0, 0]), mimeType: "image/webp", size: 4 }
      : { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]), mimeType: "image/jpeg", size: 4 },
  }));
  assert(response.status === 422 && previewFailure);
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

Deno.test("finalize is idempotent only after both preview-aware objects were verified", async () => {
  let downloaded = false;
  const response = await handleFinalizeWorkImageUpload(post({ work_image_id: IMAGE_ID }), dependencies({
    rpc: async () => ({
      ...context,
      upload_status: "ready",
      verified: true,
      preview_required: true,
      preview_verified: true,
    }),
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
