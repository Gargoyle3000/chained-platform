import { asRecord, errorResponse, jsonResponse, MediaError, parseStrictJson, requirePost, requireUuid } from "../_shared/work-media.ts";

export const WORKER_SOURCE_TTL_SECONDS = 120;
export const STAGING_BUCKET = "work-derivative-staging";

export type WorkerBrokerDependencies = {
  workerToken: string | undefined;
  rpc(name: string, body: Record<string, unknown>): Promise<unknown>;
  signSource(path: string, expiresIn: number): Promise<string>;
  signUpload(path: string): Promise<{ url: string; token: string }>;
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

export async function handleWorkerImageBroker(request: Request, dependencies: WorkerBrokerDependencies): Promise<Response> {
  try {
    requirePost(request);
    requireWorker(request, dependencies.workerToken);
    const body = await parseStrictJson(request, ["operation", "job_id"]);
    if (body.operation !== "claim") throw new MediaError(400, "invalid_operation");
    const jobId = requireUuid(body.job_id, "job_id");
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
