import assert from "node:assert/strict";
import test from "node:test";
import { handleWorkerImageBroker, WORKER_SOURCE_TTL_SECONDS } from "./logic.ts";

const JOB = "11111111-1111-4111-8111-111111111111";
const LEASE = "22222222-2222-4222-8222-222222222222";
const TOKEN = "test-worker-token-with-sufficient-entropy";
const request = (body: unknown, token = TOKEN) => new Request("http://local", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });

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
    ...overrides,
  };
}

test("broker rejects absent, invalid, and malformed worker requests before lifecycle access", async () => {
  for (const candidate of [new Request("http://local", { method: "POST", body: "{}" }), request({ operation: "claim", job_id: JOB }, "wrong"), request({ operation: "claim", job_id: "bad" })]) {
    const deps = dependencies(); const response = await handleWorkerImageBroker(candidate, deps as never);
    assert.ok([400, 401].includes(response.status)); assert.equal(deps.calls.length, 0);
  }
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
