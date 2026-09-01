import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processImage, ProcessorFailure } from "./processor.mjs";

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const FAILURE_CODES = new Set(["unsupported_format", "decoder_failed", "unsupported_tagged_colour", "unsupported_untagged_colour", "decoded_pixel_limit_rejected", "processing_failed"]);
const safe = (code, status = 500) => new Response(JSON.stringify({ ok: false, error: code }), { status, headers: { "content-type": "application/json" } });
const uuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

class BrokerRejection extends Error {
  constructor(status, code) {
    super("broker_unavailable");
    this.status = status;
    this.code = code;
  }
}

function safeBrokerCode(body) {
  try {
    const value = JSON.parse(body);
    return typeof value?.error === "string" && /^[a-z_]{1,80}$/.test(value.error) ? value.error : "unknown";
  } catch {
    return "unknown";
  }
}

function diagnostic(logger, event, metadata) {
  logger(JSON.stringify({ event, ...metadata }));
}

function expectedDimensions(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function createWorker({ brokerUrl, workerToken, process = processImage, fetcher = fetch, logger = console.info }) {
  async function broker(body) {
    const response = await fetcher(brokerUrl, { method: "POST", headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (response.status === 204) return null;
    if (!response.ok) throw new BrokerRejection(response.status, safeBrokerCode(await response.text()));
    return await response.json();
  }

  async function processClaim(claim, drain) {
    let workspace;
    let completing = false;
    let completionMetadata;
    try {
      if (!claim || !uuid(claim.job_id) || !uuid(claim.lease_token) || typeof claim.source?.download_url !== "string" || !claim.outputs?.small || !claim.outputs?.large) throw new Error("broker_unavailable");
      workspace = await mkdtemp(join(tmpdir(), "chained-worker-"));
      const source = await fetcher(claim.source.download_url, { redirect: "error" });
      const bytes = new Uint8Array(await source.arrayBuffer());
      if (!source.ok || bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("download_failed");
      await writeFile(join(workspace, "source"), bytes);
      const result = await process(join(workspace, "source"), workspace);
      for (const key of ["small", "large"]) {
        const output = claim.outputs[key];
        const file = await readFile(result[key].path);
        const upload = await fetcher(output.upload_url, { method: "PUT", headers: { "content-type": "image/webp", "x-upsert": "false", "x-signature": output.token }, body: file });
        if (!upload.ok) throw new Error("upload_failed");
      }
      const expectedSmall = expectedDimensions(claim.source.pixel_width, claim.source.pixel_height, 960);
      const expectedLarge = expectedDimensions(claim.source.pixel_width, claim.source.pixel_height, 3200);
      completionMetadata = {
        job_id: claim.job_id,
        source_width: claim.source.pixel_width,
        source_height: claim.source.pixel_height,
        small_width: result.small.width,
        small_height: result.small.height,
        large_width: result.large.width,
        large_height: result.large.height,
        expected_small_width: expectedSmall.width,
        expected_small_height: expectedSmall.height,
        expected_large_width: expectedLarge.width,
        expected_large_height: expectedLarge.height,
        small_bytes: result.small.bytes,
        large_bytes: result.large.bytes,
        small_mime: result.small.mimeType ?? "image/webp",
        large_mime: result.large.mimeType ?? "image/webp",
        processor_completion_reached: true,
      };
      diagnostic(logger, "derivative_completion_started", completionMetadata);
      completing = true;
      const complete = await broker({ operation: "complete", job_id: claim.job_id, lease_token: claim.lease_token });
      if (complete?.state !== "ready") throw new Error("broker_unavailable");
      return new Response(JSON.stringify({ job_id: claim.job_id, state: "ready" }), { headers: { "content-type": "application/json" } });
    } catch (error) {
      if (completing && error instanceof BrokerRejection) {
        diagnostic(logger, "derivative_completion_rejected", {
          ...completionMetadata,
          broker_status: error.status,
          broker_error: error.code,
        });
      }
      const code = error instanceof ProcessorFailure ? error.code : (error instanceof Error ? error.message : "processing_failed");
      let recorded = false;
      if (claim?.lease_token && !completing) {
        const permanent = error instanceof ProcessorFailure;
        const failureCode = permanent ? (FAILURE_CODES.has(code) ? code : "processing_failed") : (code === "download_failed" ? "download_failed" : "upload_failed");
        try {
          const failed = await broker({ operation: "fail", job_id: claim.job_id, lease_token: claim.lease_token, failure_code: failureCode, retryable: !permanent });
          recorded = failed?.state === "pending" || failed?.state === "failed";
        } catch {}
      }
      if (drain && recorded) return new Response(JSON.stringify({ job_id: claim.job_id, state: "recorded_failure" }), { headers: { "content-type": "application/json" } });
      return safe(completing ? "completion_unknown" : "processing_failed", error instanceof ProcessorFailure ? 422 : 502);
    } finally {
      if (workspace) await rm(workspace, { recursive: true, force: true });
    }
  }

  return async function handler(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    if (request.method !== "POST" || (path !== "/process-job" && path !== "/drain")) return safe("not_found", 404);
    if (path === "/drain") {
      const text = await request.text();
      if (text.trim()) return safe("invalid_request", 400);
      try {
        const claim = await broker({ operation: "claim_next" });
        if (!claim) return new Response(null, { status: 204 });
        return await processClaim(claim, true);
      } catch {
        return safe("processing_failed", 502);
      }
    }
    let body;
    try { body = await request.json(); } catch { return safe("invalid_request", 400); }
    if (!body || Object.keys(body).length !== 1 || !uuid(body.job_id)) return safe("invalid_request", 400);
    try { return await processClaim(await broker({ operation: "claim", job_id: body.job_id }), false); } catch { return safe("processing_failed", 502); }
  };
}
