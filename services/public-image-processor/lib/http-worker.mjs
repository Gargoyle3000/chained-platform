import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processImage, ProcessorFailure } from "./processor.mjs";

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const FAILURE_CODES = new Set(["unsupported_format", "decoder_failed", "unsupported_tagged_colour", "unsupported_untagged_colour", "decoded_pixel_limit_rejected", "processing_failed"]);
const safe = (code, status = 500) => new Response(JSON.stringify({ ok: false, error: code }), { status, headers: { "content-type": "application/json" } });
const uuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function createWorker({ brokerUrl, workerToken, process = processImage, fetcher = fetch }) {
  async function broker(body) {
    const response = await fetcher(brokerUrl, { method: "POST", headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("broker_unavailable"); return await response.json();
  }
  return async function handler(request) {
    if (request.method === "GET" && new URL(request.url).pathname === "/health") return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/process-job") return safe("not_found", 404);
    let body; try { body = await request.json(); } catch { return safe("invalid_request", 400); }
    if (!body || Object.keys(body).length !== 1 || !uuid(body.job_id)) return safe("invalid_request", 400);
    let claim; let workspace; let completing = false;
    try {
      claim = await broker({ operation: "claim", job_id: body.job_id });
      if (!claim || claim.job_id !== body.job_id || !uuid(claim.lease_token) || typeof claim.source?.download_url !== "string" || !claim.outputs?.small || !claim.outputs?.large) throw new Error("broker_unavailable");
      workspace = await mkdtemp(join(tmpdir(), "chained-worker-"));
      const source = await fetcher(claim.source.download_url, { redirect: "error" });
      const bytes = new Uint8Array(await source.arrayBuffer()); if (!source.ok || bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("download_failed");
      await writeFile(join(workspace, "source"), bytes); const result = await process(join(workspace, "source"), workspace);
      for (const key of ["small", "large"]) { const output = claim.outputs[key]; const file = await readFile(result[key].path); const upload = await fetcher(output.upload_url, { method: "PUT", headers: { "content-type": "image/webp", "x-upsert": "false", "x-signature": output.token }, body: file }); if (!upload.ok) throw new Error("upload_failed"); }
      completing = true; const complete = await broker({ operation: "complete", job_id: body.job_id, lease_token: claim.lease_token });
      if (complete?.state !== "ready") throw new Error("broker_unavailable"); return new Response(JSON.stringify({ job_id: body.job_id, state: "ready" }), { headers: { "content-type": "application/json" } });
    } catch (error) {
      const code = error instanceof ProcessorFailure ? error.code : (error instanceof Error ? error.message : "processing_failed");
      if (claim?.lease_token && !completing) { const permanent = error instanceof ProcessorFailure; const failureCode = permanent ? (FAILURE_CODES.has(code) ? code : "processing_failed") : (code === "download_failed" ? "download_failed" : "upload_failed"); try { await broker({ operation: "fail", job_id: body.job_id, lease_token: claim.lease_token, failure_code: failureCode, retryable: !permanent }); } catch {} }
      return safe(completing ? "completion_unknown" : "processing_failed", error instanceof ProcessorFailure ? 422 : 502);
    } finally { if (workspace) await rm(workspace, { recursive: true, force: true }); }
  };
}
