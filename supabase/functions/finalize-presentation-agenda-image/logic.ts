import {
  asRecord,
  errorResponse,
  jsonResponse,
  MediaError,
  parseStrictJson,
  requirePost,
  requireUuid,
  validateStoredObject,
} from "../_shared/work-media.ts";
import type { MediaDependencies } from "../_shared/work-media.ts";

const AGENDA_BUCKET = "presentation-agenda-media";

export async function handleFinalizePresentationAgendaImage(
  request: Request,
  dependencies: MediaDependencies,
): Promise<Response> {
  try {
    requirePost(request);
    const body = await parseStrictJson(request, ["image_id"]);
    const imageId = requireUuid(body.image_id, "image_id");
    const caller = await dependencies.authenticate(request);
    const context = asRecord(await dependencies.rpc("service_get_presentation_agenda_image_upload", {
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
      const original = await dependencies.download(AGENDA_BUCKET, String(context.object_path ?? ""));
      validateStoredObject(original, String(context.mime_type ?? ""), Number(context.file_size), String(context.object_path ?? ""));
      const preview = await dependencies.download(AGENDA_BUCKET, String(context.preview_object_path ?? ""));
      validateStoredObject(preview, "image/webp", Number(context.preview_file_size), String(context.preview_object_path ?? ""));
    } catch (error) {
      const code = error instanceof MediaError ? error.code : "verification_failed";
      await dependencies.rpc("service_mark_presentation_agenda_image_upload", {
        target_image_id: imageId, actor_account_id: caller.accountId, verified: false, failure_code: code,
      });
      throw error;
    }
    const result = asRecord(await dependencies.rpc("service_mark_presentation_agenda_image_upload", {
      target_image_id: imageId, actor_account_id: caller.accountId, verified: true, failure_code: null,
    }));
    const retired = Array.isArray(result.retired_paths)
      ? result.retired_paths.filter((path): path is string => typeof path === "string" && path.length > 0)
      : [];
    if (retired.length) {
      const removed = await dependencies.remove(AGENDA_BUCKET, retired);
      if (removed) await dependencies.rpc("service_finish_presentation_agenda_image_cleanup", { target_image_id: imageId, actor_account_id: caller.accountId });
    }
    return jsonResponse(200, { ok: true, status: "ready", idempotent: false });
  } catch (error) {
    return errorResponse(error);
  }
}
