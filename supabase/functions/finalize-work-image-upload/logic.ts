import {
  asRecord,
  errorResponse,
  jsonResponse,
  MediaError,
  ORIGINAL_BUCKET,
  parseStrictJson,
  requirePost,
  requireUuid,
  validateStoredObject,
} from "../_shared/work-media.ts";
import type { MediaDependencies } from "../_shared/work-media.ts";

export async function handleFinalizeWorkImageUpload(
  request: Request,
  dependencies: MediaDependencies,
): Promise<Response> {
  try {
    requirePost(request);
    const body = await parseStrictJson(request, ["work_image_id"]);
    const imageId = requireUuid(body.work_image_id, "work_image_id");
    const caller = await dependencies.authorize(request, "work_image", imageId);
    const context = asRecord(await dependencies.rpc("service_get_work_image_upload", {
      target_image_id: imageId,
      actor_account_id: caller.accountId,
    }));

    if (context.upload_status === "ready" && context.verified === true) {
      return jsonResponse(200, { ok: true, status: "ready", idempotent: true });
    }
    if (context.upload_status !== "reserved" && context.upload_status !== "failed") {
      throw new MediaError(409, "upload_not_finalizable");
    }

    try {
      const objectPath = String(context.object_path ?? "");
      const mimeType = String(context.mime_type ?? "");
      const fileSize = Number(context.file_size);
      const object = await dependencies.download(ORIGINAL_BUCKET, objectPath);
      validateStoredObject(object, mimeType, fileSize, objectPath);
    } catch (error) {
      const code = error instanceof MediaError ? error.code : "verification_failed";
      await dependencies.rpc("service_mark_work_image_upload", {
        target_image_id: imageId,
        actor_account_id: caller.accountId,
        verified: false,
        failure_code: code,
      });
      throw error;
    }

    await dependencies.rpc("service_mark_work_image_upload", {
      target_image_id: imageId,
      actor_account_id: caller.accountId,
      verified: true,
      failure_code: null,
    });
    return jsonResponse(200, { ok: true, status: "ready", idempotent: false });
  } catch (error) {
    return errorResponse(error);
  }
}
