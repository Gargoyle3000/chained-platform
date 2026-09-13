import { createPrivateImagePreview, validateImageFile } from "./work-media-service.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireId(value, message = "AGENDA IMAGE IS CURRENTLY UNAVAILABLE") {
  if (!UUID_PATTERN.test(String(value || ""))) throw new Error(message);
  return String(value).toLowerCase();
}

function optionalId(value) {
  return UUID_PATTERN.test(String(value || "")) ? String(value).toLowerCase() : null;
}

function requireRpc(error, data, fallback) {
  if (error) throw new Error(fallback);
  return data;
}

async function invokeAuthenticatedFunction(client, name, body) {
  const { data, error } = await client.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw new Error("AGENDA IMAGE AUTHENTICATION IS REQUIRED");

  return client.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

export function createPresentationAgendaImageService(
  client,
  { createPreview = createPrivateImagePreview } = {}
) {
  return Object.freeze({
    async getContext(presentationId) {
      const { data, error } = await client.rpc(
        "get_managed_presentation_agenda_image_context",
        { target_presentation_id: requireId(presentationId) }
      );
      const values = requireRpc(error, data, "AGENDA IMAGE IS CURRENTLY UNAVAILABLE");
      const rows = Array.isArray(values) ? values : [];
      return Object.freeze({
        hasDedicatedImage: rows.some((row) => row.has_dedicated_image === true),
        representativeWorkId: optionalId(rows[0]?.representative_work_id),
        works: Object.freeze(rows
          .filter((row) => optionalId(row.work_id))
          .map((row) => Object.freeze({
            id: row.work_id,
            title: String(row.work_title || "UNTITLED WORK").trim() || "UNTITLED WORK"
          })))
      });
    },

    async setRepresentativeWork(presentationId, workId = null) {
      const { data, error } = await client.rpc("set_presentation_representative_work", {
        target_presentation_id: requireId(presentationId),
        target_work_id: workId ? requireId(workId, "REPRESENTATIVE WORK COULD NOT BE SAVED") : null
      });
      return requireRpc(error, data, "REPRESENTATIVE WORK COULD NOT BE SAVED");
    },

    async upload(presentationId, file) {
      validateImageFile(file);
      const preview = await createPreview(file);
      const { data, error } = await client.rpc("reserve_presentation_agenda_image_upload", {
        target_presentation_id: requireId(presentationId),
        original_filename: file.name,
        mime_type: file.type.toLowerCase(),
        file_size: file.size,
        preview_file_size: preview.size
      });
      const reservation = Array.isArray(data) ? data[0] : null;
      if (error || !reservation?.image_id || !reservation?.object_path || !reservation?.preview_object_path) {
        throw new Error("AGENDA IMAGE COULD NOT BE RESERVED");
      }

      const bucket = String(reservation.bucket_id || "");
      const original = await client.storage.from(bucket).upload(
        reservation.object_path,
        file,
        { contentType: file.type.toLowerCase(), upsert: false }
      );
      if (original.error) throw new Error("AGENDA IMAGE COULD NOT BE UPLOADED");

      const previewUpload = await client.storage.from(bucket).upload(
        reservation.preview_object_path,
        preview,
        { contentType: "image/webp", upsert: false }
      );
      if (previewUpload.error) throw new Error("AGENDA IMAGE COULD NOT BE UPLOADED");

      const finalized = await invokeAuthenticatedFunction(
        client,
        "finalize-presentation-agenda-image",
        { image_id: reservation.image_id }
      );
      if (finalized.error || finalized.data?.ok !== true || finalized.data?.status !== "ready") {
        throw new Error("AGENDA IMAGE COULD NOT BE VERIFIED");
      }
      return Object.freeze({ imageId: reservation.image_id });
    },

    async remove(presentationId) {
      const { data, error } = await invokeAuthenticatedFunction(
        client,
        "delete-presentation-agenda-image",
        { presentation_id: requireId(presentationId) }
      );
      if (error || data?.ok !== true) throw new Error("AGENDA IMAGE COULD NOT BE REMOVED");
      return true;
    }
  });
}
