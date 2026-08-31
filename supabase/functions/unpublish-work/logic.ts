import {
  asRecord,
  asRecords,
  errorResponse,
  jsonResponse,
  optionalUuid,
  parseStrictJson,
  PUBLIC_BUCKET,
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
    const body = await parseStrictJson(request, ["work_id", "idempotency_key"]);
    const workId = requireUuid(body.work_id, "work_id");
    const idempotencyKey = optionalUuid(body.idempotency_key, "idempotency_key");
    const caller = await dependencies.authorize(request, "work", workId);

    const operation = asRecord(await dependencies.rpc("service_begin_work_unpublication", {
      target_work_id: workId,
      actor_account_id: caller.accountId,
      idempotency_key: idempotencyKey,
    }));
    const status = String(operation.status ?? "");
    if (status === "already_hidden" || status === "succeeded") {
      return jsonResponse(200, {
        ok: true,
        status: "draft",
        cleanup_status: "succeeded",
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

    return jsonResponse(200, {
      ok: true,
      status: "draft",
      cleanup_status: cleanupComplete ? "succeeded" : "cleanup_pending",
      idempotent: operation.idempotent === true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
