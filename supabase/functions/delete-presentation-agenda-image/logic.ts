import {
  asRecord,
  errorResponse,
  jsonResponse,
  MediaError,
  parseStrictJson,
  requirePost,
  requireUuid,
} from "../_shared/work-media.ts";
import type { MediaDependencies } from "../_shared/work-media.ts";

const AGENDA_BUCKET = "presentation-agenda-media";

export async function handleDeletePresentationAgendaImage(
  request: Request,
  dependencies: MediaDependencies,
): Promise<Response> {
  try {
    requirePost(request);
    const body = await parseStrictJson(request, ["presentation_id"]);
    const presentationId = requireUuid(body.presentation_id, "presentation_id");
    const caller = await dependencies.authenticate(request);
    const removal = asRecord(await dependencies.rpc("service_get_presentation_agenda_image_removal", {
      target_presentation_id: presentationId,
      actor_account_id: caller.accountId,
    }));
    const imageId = requireUuid(removal.image_id, "image_id");
    const paths = Array.isArray(removal.paths)
      ? removal.paths.filter((path): path is string => typeof path === "string" && path.length > 0)
      : [];
    if (paths.length && !await dependencies.remove(AGENDA_BUCKET, paths)) {
      throw new MediaError(502, "cleanup_failed");
    }
    await dependencies.rpc("service_remove_presentation_agenda_image", {
      target_presentation_id: presentationId,
      expected_image_id: imageId,
      actor_account_id: caller.accountId,
    });
    return jsonResponse(200, { ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
