import { asRecord, createMediaDependencies, errorResponse, MediaError, requireUuid } from "../_shared/work-media.ts";

const AGENDA_BUCKET = "presentation-agenda-media";
const dependencies = createMediaDependencies();

Deno.serve(async (request) => {
  try {
    if (request.method !== "GET") throw new MediaError(405, "method_not_allowed");
    const presentationId = requireUuid(new URL(request.url).searchParams.get("presentation_id"), "presentation_id");
    const resolved = await dependencies.rpc("service_get_public_presentation_agenda_image", { target_presentation_id: presentationId });
    if (!resolved) throw new MediaError(404, "image_unavailable");
    const context = asRecord(resolved);
    const path = String(context.preview_object_path ?? "");
    if (!path) throw new MediaError(404, "image_unavailable");
    const image = await dependencies.download(AGENDA_BUCKET, path);
    if (image.mimeType.toLowerCase() !== "image/webp" || image.size < 1) throw new MediaError(404, "image_unavailable");
    return new Response(image.bytes, { status: 200, headers: { "content-type": "image/webp", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    return errorResponse(error);
  }
});
