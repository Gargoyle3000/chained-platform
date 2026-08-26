import {
  asRecord,
  errorResponse,
  jsonResponse,
  ORIGINAL_BUCKET,
  parseStrictJson,
  PUBLIC_BUCKET,
  requirePost,
  requireUuid,
} from "../_shared/work-media.ts";
import type { MediaDependencies } from "../_shared/work-media.ts";

export async function handleDeleteWorkImage(
  request: Request,
  dependencies: MediaDependencies,
): Promise<Response> {
  try {
    requirePost(request);
    const body = await parseStrictJson(request, ["work_image_id"]);
    const imageId = requireUuid(body.work_image_id, "work_image_id");
    const caller = await dependencies.authorize(request, "work_image", imageId);

    const deletion = asRecord(await dependencies.rpc("service_begin_work_image_deletion", {
      target_image_id: imageId,
      actor_account_id: caller.accountId,
    }));
    if (deletion.status === "deleted") {
      return jsonResponse(200, {
        ok: true,
        status: "deleted",
        cleanup_status: "succeeded",
        idempotent: true,
      });
    }

    const privatePath = String(deletion.private_object_path ?? "");
    const previewPath = String(deletion.preview_object_path ?? "");
    const publicPath = String(deletion.public_object_path ?? "");
    const privatePaths = [privatePath, previewPath].filter(Boolean);
    const privateRemoved = privatePaths.length > 0
      ? await dependencies.remove(ORIGINAL_BUCKET, privatePaths)
      : true;
    const publicRemoved = publicPath
      ? await dependencies.remove(PUBLIC_BUCKET, [publicPath])
      : true;
    const cleanupComplete = privateRemoved && publicRemoved;

    await dependencies.rpc("service_finish_work_image_deletion", {
      target_image_id: imageId,
      actor_account_id: caller.accountId,
      cleanup_complete: cleanupComplete,
      failure_code: cleanupComplete ? null : "object_cleanup_incomplete",
    });

    return jsonResponse(200, {
      ok: true,
      status: cleanupComplete ? "deleted" : "cleanup_pending",
      cleanup_status: cleanupComplete ? "succeeded" : "cleanup_pending",
      idempotent: deletion.idempotent === true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
