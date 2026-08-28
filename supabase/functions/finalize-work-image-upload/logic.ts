import {
  asRecord,
  errorResponse,
  jsonResponse,
  MediaError,
  ORIGINAL_BUCKET,
  parseStrictJson,
  requirePost,
  requireUuid,
  trustedImageDimensions,
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

    let failureStage: "original" | "preview" = "original";
    let originalDimensions: { width: number; height: number } | null = null;
    try {
      const objectPath = String(context.object_path ?? "");
      const mimeType = String(context.mime_type ?? "");
      const fileSize = Number(context.file_size);
      const object = await dependencies.download(ORIGINAL_BUCKET, objectPath);
      validateStoredObject(object, mimeType, fileSize, objectPath);
      originalDimensions = trustedImageDimensions(object.bytes, mimeType);

      if (context.preview_required === true) {
        failureStage = "preview";
        const previewPath = String(context.preview_object_path ?? "");
        const previewMimeType = String(context.preview_mime_type ?? "");
        const previewFileSize = Number(context.preview_file_size);
        if (!previewPath || previewMimeType !== "image/webp" || !Number.isSafeInteger(previewFileSize)
          || previewFileSize <= 0 || previewFileSize > 5 * 1024 * 1024) {
          throw new MediaError(422, "preview_contract_invalid");
        }
        const preview = await dependencies.download(ORIGINAL_BUCKET, previewPath);
        validateStoredObject(preview, previewMimeType, previewFileSize, previewPath);
      }
    } catch (error) {
      const code = error instanceof MediaError ? error.code : "verification_failed";
      await dependencies.rpc("service_mark_work_image_upload", {
        target_image_id: imageId,
        actor_account_id: caller.accountId,
        verified: false,
        failure_code: code,
        ...(context.preview_required === true ? { preview_failure: failureStage === "preview" } : {}),
      });
      throw error;
    }

    await dependencies.rpc("service_mark_work_image_upload", {
      target_image_id: imageId,
      actor_account_id: caller.accountId,
      verified: true,
      failure_code: null,
      ...(originalDimensions ? { pixel_width: originalDimensions.width, pixel_height: originalDimensions.height } : {}),
      ...(context.preview_required === true ? { preview_failure: false } : {}),
    });
    return jsonResponse(200, { ok: true, status: "ready", idempotent: false });
  } catch (error) {
    return errorResponse(error);
  }
}
