import {
  asRecord,
  asRecords,
  errorResponse,
  jsonResponse,
  optionalUuid,
  parseStrictJson,
  PUBLIC_BUCKET,
  MediaError,
  requirePost,
  requireUuid,
} from "../_shared/work-media.ts";
import type { MediaDependencies } from "../_shared/work-media.ts";

export async function handleUnpublishWork(
  request: Request,
  dependencies: MediaDependencies,
): Promise<Response> {
  try {
    requirePost(request);
    const body = await parseStrictJson(request, ["work_id", "idempotency_key", "delete_after_unpublish"]);
    const workId = requireUuid(body.work_id, "work_id");
    const idempotencyKey = optionalUuid(body.idempotency_key, "idempotency_key");
    if (body.delete_after_unpublish !== undefined && typeof body.delete_after_unpublish !== "boolean") {
      throw new MediaError(400, "invalid_delete_after_unpublish");
    }
    const deleteAfterUnpublish = body.delete_after_unpublish === true;
    const caller = await dependencies.authorize(request, "work", workId);

    const finishDeletion = async () => {
      if (!deleteAfterUnpublish) return false;
      await dependencies.rpc("service_soft_delete_unpublished_work", {
        target_work_id: workId,
        actor_account_id: caller.accountId,
      });
      return true;
    };

    const operation = asRecord(await dependencies.rpc("service_begin_work_unpublication", {
      target_work_id: workId,
      actor_account_id: caller.accountId,
      idempotency_key: idempotencyKey,
    }));
    const status = String(operation.status ?? "");
    if (status === "already_hidden" || status === "succeeded") {
      const deleted = await finishDeletion();
      return jsonResponse(200, {
        ok: true,
        status: deleted ? "deleted" : "draft",
        cleanup_status: "succeeded",
        deleted,
        idempotent: true,
      });
    }

    const operationId = requireUuid(operation.operation_id, "operation_id");
    const paths = asRecords(await dependencies.rpc("service_list_work_publication_cleanup_paths", {
      target_operation_id: operationId,
      actor_account_id: caller.accountId,
    }))
      .map((image) => String(image.public_object_path ?? ""))
      .filter(Boolean);
    const cleanupComplete = await dependencies.remove(PUBLIC_BUCKET, paths);

    await dependencies.rpc("service_record_derivative_public_cleanup", {
      target_operation_id: operationId,
      actor_account_id: caller.accountId,
      cleanup_complete: cleanupComplete,
      failure_code: cleanupComplete ? null : "public_recall_incomplete",
    });

    const deleted = cleanupComplete ? await finishDeletion() : false;

    return jsonResponse(200, {
      ok: true,
      status: deleted ? "deleted" : "draft",
      cleanup_status: cleanupComplete ? "succeeded" : "cleanup_pending",
      deleted,
      idempotent: operation.idempotent === true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
