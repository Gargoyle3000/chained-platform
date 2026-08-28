import { asRecord, errorResponse, jsonResponse, MediaError, parseStrictJson, requirePost, requireUuid } from "../_shared/work-media.ts";

export const WORKER_SOURCE_TTL_SECONDS = 120;
export const STAGING_BUCKET = "work-derivative-staging";
const PIPELINE_VERSION = "chained-public-image-sharp-0.34.1-v1";
const ICC_PROFILE_VERSION = "chained-srgb-v4-2026-08-27";
const FAILURE_CODES = new Set(["broker_unavailable", "download_failed", "upload_failed", "timeout", "unsupported_format", "decoder_failed", "unsupported_tagged_colour", "unsupported_untagged_colour", "decoded_pixel_limit_rejected", "processing_failed"]);

export type WorkerBrokerDependencies = {
  workerToken: string | undefined;
  rpc(name: string, body: Record<string, unknown>): Promise<unknown>;
  signSource(path: string, expiresIn: number): Promise<string>;
  signUpload(path: string): Promise<{ url: string; token: string }>;
  downloadStaging(path: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
};

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index % Math.max(a.length, 1)] ?? 0) ^ (b[index % Math.max(b.length, 1)] ?? 0);
  return difference === 0;
}

function requireWorker(request: Request, configured: string | undefined): void {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!configured?.trim() || !match || !constantTimeEqual(match[1], configured.trim())) {
    throw new MediaError(401, "worker_authentication_required");
  }
}

function text(context: Record<string, unknown>, field: string): string {
  const value = context[field];
  if (typeof value !== "string" || !value) throw new MediaError(502, "broker_context_invalid");
  return value;
}
function positive(context: Record<string, unknown>, field: string): number {
  const value = Number(context[field]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new MediaError(502, "broker_context_invalid");
  return value;
}
export function derivativeDimensions(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") return null;
  const tag = String.fromCharCode(...bytes.slice(12, 16)); const le16 = (i: number) => bytes[i]! | (bytes[i + 1]! << 8);
  if (tag === "VP8X") return { width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16), height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16) };
  if (tag === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
  if (tag === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) { const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
  return null;
}
async function verifyOutput(object: { bytes: Uint8Array; mimeType: string }, expected: { width: number; height: number }) {
  if (object.bytes.byteLength === 0 || object.bytes.byteLength > 50 * 1024 * 1024) throw new MediaError(422, "output_too_large");
  if (object.mimeType.toLowerCase() !== "image/webp") throw new MediaError(422, "wrong_mime");
  const dimensions = webpDimensions(object.bytes); if (!dimensions) throw new MediaError(422, "invalid_webp");
  if (dimensions.width !== expected.width || dimensions.height !== expected.height) throw new MediaError(422, "wrong_dimensions");
  const ownedBytes = Uint8Array.from(object.bytes);
  const digest = await crypto.subtle.digest("SHA-256", ownedBytes.buffer); return { bytes: object.bytes.byteLength, ...dimensions, checksum: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("") };
}

export async function handleWorkerImageBroker(request: Request, dependencies: WorkerBrokerDependencies): Promise<Response> {
  try {
    requirePost(request);
    requireWorker(request, dependencies.workerToken);
    const body = await parseStrictJson(request, ["operation", "job_id", "lease_token", "outputs", "failure_code", "retryable"]);
    if (body.operation !== "claim" && body.operation !== "complete" && body.operation !== "fail") throw new MediaError(400, "invalid_operation");
    const jobId = requireUuid(body.job_id, "job_id");
    if (body.operation === "fail") {
      const leaseToken = requireUuid(body.lease_token, "lease_token");
      if (typeof body.failure_code !== "string" || !FAILURE_CODES.has(body.failure_code) || typeof body.retryable !== "boolean") throw new MediaError(400, "invalid_failure");
      const result = asRecord(await dependencies.rpc("service_fail_work_image_derivative_job", { target_job_id: jobId, expected_lease_token: leaseToken, sanitized_failure_code: body.failure_code, sanitized_failure_detail: null, retryable: body.retryable }));
      if (result.status !== "pending" && result.status !== "failed") throw new MediaError(409, "job_unavailable");
      return jsonResponse(200, { job_id: jobId, state: result.status });
    }
    if (body.operation === "complete") {
      const leaseToken = requireUuid(body.lease_token, "lease_token");
      const context = asRecord(await dependencies.rpc("service_get_work_image_derivative_claim_context", { target_job_id: jobId, expected_lease_token: leaseToken }));
      const width = positive(context, "pixel_width"), height = positive(context, "pixel_height");
      const [small, large] = await Promise.all([dependencies.downloadStaging(text(context, "small_staging_object_path")), dependencies.downloadStaging(text(context, "large_staging_object_path"))]);
      const [verifiedSmall, verifiedLarge] = await Promise.all([verifyOutput(small, derivativeDimensions(width, height, 960)), verifyOutput(large, derivativeDimensions(width, height, 3200))]);
      const result = asRecord(await dependencies.rpc("service_complete_work_image_derivative_job", { target_job_id: jobId, expected_lease_token: leaseToken, pipeline: PIPELINE_VERSION, icc_profile: ICC_PROFILE_VERSION, small_file_size: verifiedSmall.bytes, small_width: verifiedSmall.width, small_height: verifiedSmall.height, small_checksum: verifiedSmall.checksum, large_file_size: verifiedLarge.bytes, large_width: verifiedLarge.width, large_height: verifiedLarge.height, large_checksum: verifiedLarge.checksum }));
      if (result.status !== "ready") throw new MediaError(409, "job_unavailable");
      return jsonResponse(200, { job_id: jobId, state: "ready" });
    }
    const claim = asRecord(await dependencies.rpc("service_claim_work_image_derivative_job", { target_job_id: jobId }));
    if (claim.status !== "processing") throw new MediaError(409, "job_unavailable");
    if (requireUuid(claim.job_id, "claimed_job_id") !== jobId) throw new MediaError(502, "broker_context_invalid");
    const leaseToken = requireUuid(claim.lease_token, "lease_token");
    const leaseExpiresAt = text(claim, "lease_expires_at");
    const context = asRecord(await dependencies.rpc("service_get_work_image_derivative_claim_context", { target_job_id: jobId, expected_lease_token: leaseToken }));
    const sourcePath = text(context, "source_private_object_path");
    const smallPath = text(context, "small_staging_object_path");
    const largePath = text(context, "large_staging_object_path");
    const [downloadUrl, small, large] = await Promise.all([
      dependencies.signSource(sourcePath, WORKER_SOURCE_TTL_SECONDS), dependencies.signUpload(smallPath), dependencies.signUpload(largePath),
    ]);
    return jsonResponse(200, { job_id: jobId, lease_token: leaseToken, lease_expires_at: leaseExpiresAt,
      source: { download_url: downloadUrl, mime_type: text(context, "source_mime_type"), pixel_width: positive(context, "pixel_width"), pixel_height: positive(context, "pixel_height") },
      outputs: { small: { upload_url: small.url, token: small.token, path: smallPath }, large: { upload_url: large.url, token: large.token, path: largePath } } });
  } catch (error) { return errorResponse(error); }
}
