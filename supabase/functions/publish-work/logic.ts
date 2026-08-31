import {
  asRecord,
  asRecords,
  errorResponse,
  jsonResponse,
  MediaError,
  optionalUuid,
  DERIVATIVE_STAGING_BUCKET,
  parseStrictJson,
  PUBLIC_BUCKET,
  requirePost,
  requireUuid,
  validateStoredObject,
} from "../_shared/work-media.ts";
import type { MediaDependencies } from "../_shared/work-media.ts";

export async function handlePublishWork(
  request: Request,
  dependencies: MediaDependencies,
): Promise<Response> {
  let operationId: string | null = null;
  let actorAccountId: string | null = null;
  let operationImages: Record<string, unknown>[] = [];
  const createdPaths: string[] = [];

  try {
    requirePost(request);
    const body = await parseStrictJson(request, ["work_id", "idempotency_key"]);
    const workId = requireUuid(body.work_id, "work_id");
    const idempotencyKey = optionalUuid(body.idempotency_key, "idempotency_key");
    const caller = await dependencies.authorize(request, "work", workId);
    actorAccountId = caller.accountId;

    const claim = asRecord(await dependencies.rpc("service_claim_work_derivative_publication", {
      target_work_id: workId,
      actor_account_id: caller.accountId,
      idempotency_key: idempotencyKey,
    }));
    const status = String(claim.status ?? "");
    if (status === "succeeded" || status === "published") {
      return jsonResponse(200, { ok: true, status: "published", idempotent: true });
    }

    operationId = requireUuid(claim.operation_id, "operation_id");
    operationImages = asRecords(claim.images);

    if (status === "cleanup_pending") {
      const cleanupPaths = operationImages
        .filter((image) => image.copy_status !== "pending")
        .map((image) => String(image.public_object_path ?? ""))
        .filter(Boolean);
      const cleanupComplete = await dependencies.remove(PUBLIC_BUCKET, cleanupPaths);
      await dependencies.rpc("service_fail_work_derivative_publication", {
        target_operation_id: operationId,
        actor_account_id: caller.accountId,
        failure_code: "copy_failed",
        cleanup_complete: cleanupComplete,
      });
      throw new MediaError(409, cleanupComplete ? "publication_failed" : "cleanup_pending");
    }
    if (status !== "running") throw new MediaError(409, "publication_not_runnable");

    for (const image of operationImages) {
      const imageId = requireUuid(image.work_image_id, "work_image_id");
      const stagingPath = String(image.staging_object_path ?? "");
      const publicPath = String(image.public_object_path ?? "");
      const mimeType = String(image.mime_type ?? "");
      const fileSize = Number(image.file_size);
      const renditionKey = String(image.rendition_key ?? "");

      if (image.copy_status === "created") {
        createdPaths.push(publicPath);
        continue;
      }

      if (renditionKey !== "small" && renditionKey !== "large") throw new MediaError(422, "publication_not_ready");
      const object = await dependencies.download(DERIVATIVE_STAGING_BUCKET, stagingPath);
      validateStoredObject(object, mimeType, fileSize, stagingPath);
      await dependencies.upload(PUBLIC_BUCKET, publicPath, object);
      createdPaths.push(publicPath);
      await dependencies.rpc("service_record_publication_derivative_copy", {
        target_operation_id: operationId,
        target_image_id: imageId,
        target_rendition: renditionKey,
        actor_account_id: caller.accountId,
      });
    }

    await dependencies.rpc("service_finalize_work_publication", {
      target_operation_id: operationId,
      actor_account_id: caller.accountId,
    });
    return jsonResponse(200, { ok: true, status: "published", idempotent: false });
  } catch (error) {
    if (operationId && actorAccountId && !(error instanceof MediaError && error.code === "cleanup_pending")) {
      try {
        const cleanupPaths = [
          ...createdPaths,
          ...operationImages
            .filter((image) => image.copy_status === "created")
            .map((image) => String(image.public_object_path ?? "")),
        ].filter(Boolean);
        const cleanupComplete = await dependencies.remove(PUBLIC_BUCKET, cleanupPaths);
        await dependencies.rpc("service_fail_work_derivative_publication", {
          target_operation_id: operationId,
          actor_account_id: actorAccountId,
          failure_code: error instanceof MediaError ? error.code : "publication_failed",
          cleanup_complete: cleanupComplete,
        });
      } catch {
        // The durable operation remains running/cleanup-pending for a trusted retry.
      }
    }
    return errorResponse(error);
  }
}
