import { databaseImageToClient, createObjectUrlRegistry } from "./work-mapping.mjs";
import { sanitizeWorkError, WorkError, WORK_ERROR_CODES } from "./work-errors.mjs";

export const IMAGE_TYPES = Object.freeze(new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]));
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const UPLOAD_STAGES = Object.freeze(["RESERVING", "UPLOADING", "VERIFYING", "READY"]);

export function validateImageFile(file) {
  if (!file || !IMAGE_TYPES.has(String(file.type).toLowerCase())) throw new WorkError(WORK_ERROR_CODES.INVALID, "CHOOSE A JPEG, PNG, WEBP, OR AVIF IMAGE");
  if (!Number.isFinite(file.size) || file.size <= 0) throw new WorkError(WORK_ERROR_CODES.INVALID, "EMPTY IMAGE FILES CANNOT BE ADDED");
  if (file.size > MAX_IMAGE_BYTES) throw new WorkError(WORK_ERROR_CODES.INVALID, "THE MAXIMUM IMAGE SIZE IS 50 MB");
  return file;
}

async function invoke(client, name, body) {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error || data?.ok !== true) throw sanitizeWorkError(error || new Error("Function failed."));
  return data;
}

function authenticatedObjectUrl(supabaseUrl, bucket, path) {
  const encodedPath = String(path).split("/").map(encodeURIComponent).join("/");
  return new URL(`/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}`, supabaseUrl).toString();
}

async function downloadPrivateOriginal(client, config, path, fetcher) {
  const { data, error } = await client.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw error || new Error("Session unavailable.");

  const response = await fetcher(authenticatedObjectUrl(config.supabaseUrl, "work-originals", path), {
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  if (!response.ok) throw { status: response.status };
  return response.blob();
}

export function createWorkMediaService(client, config = {}, { fetcher = fetch } = {}) {
  const urls = createObjectUrlRegistry();
  return Object.freeze({
    urls,
    async upload(workId, file, makeCover, onStage = () => {}) {
      validateImageFile(file);
      try {
        onStage("RESERVING");
        const { data: reserved, error: reserveError } = await client.rpc("reserve_work_image_upload", { target_work_id: workId, original_filename: file.name, mime_type: file.type.toLowerCase(), file_size: file.size, make_cover: makeCover });
        if (reserveError || !reserved?.[0]) throw reserveError || new Error("Reservation failed.");
        const reservation = reserved[0];
        onStage("UPLOADING");
        const { error: uploadError } = await client.storage.from(reservation.bucket_id).upload(reservation.object_path, file, { contentType: file.type.toLowerCase(), upsert: false });
        if (uploadError) throw uploadError;
        onStage("VERIFYING");
        await invoke(client, "finalize-work-image-upload", { work_image_id: reservation.work_image_id });
        onStage("READY");
        return reservation.work_image_id;
      } catch (error) { throw sanitizeWorkError(error, "IMAGE COULD NOT BE ADDED"); }
    },
    async privatePreview(image) {
      if (!image.privatePath) return null;
      try {
        return urls.create(await downloadPrivateOriginal(client, config, image.privatePath, fetcher));
      } catch (error) {
        throw sanitizeWorkError(error, "PRIVATE PREVIEW IS UNAVAILABLE");
      }
    },
    publicUrl(path) { return path ? client.storage.from("work-public").getPublicUrl(path).data.publicUrl : ""; },
    finalize: (id) => invoke(client, "finalize-work-image-upload", { work_image_id: id }),
    publish: (id, key) => invoke(client, "publish-work", { work_id: id, idempotency_key: key }),
    unpublish: (id, key) => invoke(client, "unpublish-work", { work_id: id, idempotency_key: key }),
    deleteImage: (id) => invoke(client, "delete-work-image", { work_image_id: id }),
    mapImage: databaseImageToClient
  });
}
