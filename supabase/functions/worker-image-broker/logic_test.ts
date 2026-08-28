import assert from "node:assert/strict";
import test from "node:test";
import { derivativeDimensions, handleWorkerImageBroker, WORKER_SOURCE_TTL_SECONDS } from "./logic.ts";

const JOB = "11111111-1111-4111-8111-111111111111";
const LEASE = "22222222-2222-4222-8222-222222222222";
const TOKEN = "test-worker-token-with-sufficient-entropy";
const request = (body: unknown, token = TOKEN) => new Request("http://local", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const webp = (width: number, height: number) => { const bytes = new Uint8Array(30); bytes.set([82, 73, 70, 70], 0); bytes.set([87, 69, 66, 80], 8); bytes.set([86, 80, 56, 88], 12); for (const [start, value] of [[24, width - 1], [27, height - 1]] as const) { bytes[start] = value & 255; bytes[start + 1] = (value >> 8) & 255; bytes[start + 2] = (value >> 16) & 255; } return bytes; };

function dependencies(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  return {
    calls,
    workerToken: TOKEN,
    async rpc(name: string, body: Record<string, unknown>) {
      calls.push({ name, body });
      if (name === "service_claim_work_image_derivative_job") return { status: "processing", job_id: JOB, lease_token: LEASE, lease_expires_at: "2026-08-28T12:00:00.000Z" };
      return { source_private_object_path: "owner/work/image/original.jpg", source_mime_type: "image/jpeg", pixel_width: 4912, pixel_height: 7360, small_staging_object_path: "owner/work/image/public-derivatives/small.webp", large_staging_object_path: "owner/work/image/public-derivatives/large.webp" };
    },
    async signSource(path: string, ttl: number) { assert.equal(path, "owner/work/image/original.jpg"); assert.equal(ttl, WORKER_SOURCE_TTL_SECONDS); return "https://storage/source-signed"; },
    async signUpload(path: string) { return { url: `https://storage/upload/${path}`, token: `exact:${path}` }; },
    async downloadStaging(path: string) { return { bytes: webp(path.endsWith("small.webp") ? 641 : 2136, path.endsWith("small.webp") ? 960 : 3200), mimeType: "image/webp" }; },
    ...overrides,
  };
}

test("broker rejects absent, invalid, and malformed worker requests before lifecycle access", async () => {
  for (const candidate of [new Request("http://local", { method: "POST", body: "{}" }), request({ operation: "claim", job_id: JOB }, "wrong"), request({ operation: "claim", job_id: "bad" })]) {
    const deps = dependencies(); const response = await handleWorkerImageBroker(candidate, deps as never);
    assert.ok([400, 401].includes(response.status)); assert.equal(deps.calls.length, 0);
  }
});

test("complete derives both paths, verifies bytes, and invokes atomic completion only after both pass", async () => {
  const deps = dependencies({ async rpc(name: string, body: Record<string, unknown>) {
    deps.calls.push({ name, body });
    if (name === "service_get_work_image_derivative_claim_context") return { source_private_object_path: "ignored/original.jpg", source_mime_type: "image/jpeg", pixel_width: 4912, pixel_height: 7360, small_staging_object_path: "server/small.webp", large_staging_object_path: "server/large.webp" };
    return { status: "ready" };
  } });
  const response = await handleWorkerImageBroker(request({ operation: "complete", job_id: JOB, lease_token: LEASE, outputs: { small: { checksum_sha256: "forged" }, large: { checksum_sha256: "forged" } } }), deps as never);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { job_id: JOB, state: "ready" });
  const complete = deps.calls.find((call) => call.name === "service_complete_work_image_derivative_job")!;
  assert.equal(complete.body.small_width, 641); assert.equal(complete.body.large_height, 3200); assert.notEqual(complete.body.small_checksum, "forged");
});

test("complete rejects invalid output before atomic transition and never trusts caller paths", async () => {
  let completed = false; let downloaded = "";
  const deps = dependencies({ async rpc(name: string) { if (name === "service_get_work_image_derivative_claim_context") return { source_private_object_path: "x", source_mime_type: "image/jpeg", pixel_width: 4912, pixel_height: 7360, small_staging_object_path: "server/small.webp", large_staging_object_path: "server/large.webp" }; completed = true; return { status: "ready" }; }, async downloadStaging(path: string) { downloaded += path; return { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" }; } });
  const response = await handleWorkerImageBroker(request({ operation: "complete", job_id: JOB, lease_token: LEASE, source_path: "foreign", outputs: {} }), deps as never);
  assert.equal(response.status, 400); assert.equal(downloaded, ""); assert.equal(completed, false);
});

test("completion dimension rule matches processor for portrait, landscape, square, and no-upscale", () => {
  assert.deepEqual(derivativeDimensions(4912, 7360, 960), { width: 641, height: 960 });
  assert.deepEqual(derivativeDimensions(8192, 5464, 3200), { width: 3200, height: 2134 });
  assert.deepEqual(derivativeDimensions(1000, 1000, 960), { width: 960, height: 960 });
  assert.deepEqual(derivativeDimensions(100, 200, 3200), { width: 100, height: 200 });
});

test("complete rejects lease and source context failures before downloading staging", async () => {
  for (const label of ["nonexistent", "wrong_lease", "expired", "reclaimed", "deleted", "replaced_source"]) {
    let downloaded = 0; let completed = 0;
    const deps = dependencies({ async rpc(name: string) { if (name === "service_get_work_image_derivative_claim_context") throw new Error(label); completed += 1; return { status: "ready" }; }, async downloadStaging() { downloaded += 1; return { bytes: webp(641, 960), mimeType: "image/webp" }; } });
    const response = await handleWorkerImageBroker(request({ operation: "complete", job_id: JOB, lease_token: LEASE }), deps as never);
    assert.equal(response.status, 500, label); assert.equal(downloaded, 0, label); assert.equal(completed, 0, label);
  }
});

test("every missing, malformed, foreign, or wrong rendition output prevents atomic completion", async () => {
  const invalids: Array<[string, (path: string) => { bytes: Uint8Array; mimeType: string }]> = [
    ["missing small", () => { throw new Error("missing"); }], ["missing large", () => { throw new Error("missing"); }], ["wrong mime", () => ({ bytes: webp(641, 960), mimeType: "image/jpeg" })],
    ["invalid signature", () => ({ bytes: new Uint8Array(30), mimeType: "image/webp" })], ["malformed", () => ({ bytes: new Uint8Array([82, 73, 70, 70]), mimeType: "image/webp" })],
    ["wrong small", () => ({ bytes: webp(640, 960), mimeType: "image/webp" })], ["swapped", (path) => ({ bytes: path.endsWith("small.webp") ? webp(2136, 3200) : webp(641, 960), mimeType: "image/webp" })],
    ["foreign path", () => ({ bytes: webp(641, 960), mimeType: "image/webp" })],
  ];
  for (const [label, output] of invalids) {
    let completed = 0; const paths: string[] = [];
    const deps = dependencies({ async rpc(name: string) { if (name === "service_get_work_image_derivative_claim_context") return { source_private_object_path: "x", source_mime_type: "image/jpeg", pixel_width: 4912, pixel_height: 7360, small_staging_object_path: "trusted/small.webp", large_staging_object_path: "trusted/large.webp" }; completed += 1; return { status: "ready" }; }, async downloadStaging(path: string) { paths.push(path); return output(path); } });
    const response = await handleWorkerImageBroker(request({ operation: "complete", job_id: JOB, lease_token: LEASE, outputs: { path: "foreign" } }), deps as never);
    assert.notEqual(response.status, 200, label); assert.equal(completed, 0, label); assert.deepEqual(paths, ["trusted/small.webp", "trusted/large.webp"], label);
  }
});

test("complete is safely rejected after READY or lease reclaim without mutation", async () => {
  for (const state of ["ready", "reclaimed"]) {
    let downloaded = 0; let completed = 0;
    const deps = dependencies({ async rpc(name: string) { if (name === "service_get_work_image_derivative_claim_context") throw new Error(state); completed += 1; return { status: "ready" }; }, async downloadStaging() { downloaded += 1; return { bytes: webp(641, 960), mimeType: "image/webp" }; } });
    const response = await handleWorkerImageBroker(request({ operation: "complete", job_id: JOB, lease_token: LEASE }), deps as never);
    assert.equal(response.status, 500); assert.equal(downloaded, 0); assert.equal(completed, 0);
  }
});

test("fail delegates retryable and terminal state to the lifecycle RPC without paths or backoff logic", async () => {
  for (const [retryable, state] of [[true, "pending"], [false, "failed"]] as const) {
    let body: Record<string, unknown> | undefined;
    const deps = dependencies({ async rpc(name: string, value: Record<string, unknown>) { assert.equal(name, "service_fail_work_image_derivative_job"); body = value; return { status: state, available_at: "database-owned" }; } });
    const response = await handleWorkerImageBroker(request({ operation: "fail", job_id: JOB, lease_token: LEASE, failure_code: "upload_failed", retryable }), deps as never);
    assert.deepEqual(await response.json(), { job_id: JOB, state }); assert.equal(body!.retryable, retryable); assert.equal(body!.sanitized_failure_detail, null); assert.equal(JSON.stringify(body).includes("path"), false);
  }
});

test("fail rejects malformed, unsafe, stale, ready, and extra worker input safely", async () => {
  for (const payload of [
    { operation: "fail", job_id: "bad", lease_token: LEASE, failure_code: "upload_failed", retryable: true },
    { operation: "fail", job_id: JOB, lease_token: LEASE, failure_code: "raw stack trace", retryable: true },
    { operation: "fail", job_id: JOB, lease_token: LEASE, failure_code: "upload_failed", retryable: true, source_path: "secret" },
  ]) { const deps = dependencies(); const response = await handleWorkerImageBroker(request(payload), deps as never); assert.equal(response.status, 400); assert.equal(deps.calls.length, 0); }
  for (const state of ["wrong_lease", "expired", "reclaimed", "ready"]) { const deps = dependencies({ async rpc() { throw new Error(state); } }); const response = await handleWorkerImageBroker(request({ operation: "fail", job_id: JOB, lease_token: LEASE, failure_code: "upload_failed", retryable: true }), deps as never); assert.equal(response.status, 500); }
});

test("broker claims only the requested job and issues server-derived exact capabilities", async () => {
  const deps = dependencies(); const response = await handleWorkerImageBroker(request({ operation: "claim", job_id: JOB }), deps as never);
  assert.equal(response.status, 200); const body = await response.json() as Record<string, any>;
  assert.equal(deps.calls[0]!.body.target_job_id, JOB); assert.deepEqual(Object.keys(body.source).sort(), ["download_url", "mime_type", "pixel_height", "pixel_width"]);
  assert.equal(body.outputs.small.path.endsWith("small.webp"), true); assert.equal(body.outputs.large.path.endsWith("large.webp"), true);
  assert.notEqual(body.outputs.small.token, body.outputs.large.token); assert.equal(JSON.stringify(body).includes("SUPABASE_SECRET"), false);
});

test("active, stale, and untrusted jobs mint no capabilities", async () => {
  for (const claim of [{ status: "empty" }, { status: "obsolete" }, { status: "failed" }]) {
    let signed = false; const deps = dependencies({ async rpc() { return claim; }, async signSource() { signed = true; return "x"; } });
    const response = await handleWorkerImageBroker(request({ operation: "claim", job_id: JOB }), deps as never);
    assert.equal(response.status, 409); assert.equal(signed, false);
  }
});
