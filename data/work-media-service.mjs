import { databaseImageToClient, createObjectUrlRegistry } from "./work-mapping.mjs";
import { sanitizeWorkError, WorkError, WORK_ERROR_CODES } from "./work-errors.mjs";

export const IMAGE_TYPES = Object.freeze(new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]));
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const UPLOAD_STAGES = Object.freeze(["RESERVING", "UPLOADING", "VERIFYING", "READY"]);
export const PRIVATE_MEDIA_PURPOSES = Object.freeze(new Set(["preview", "pdf_export"]));
export const PRIVATE_MEDIA_BATCH_SIZE = 100;
export const PRIVATE_MEDIA_DOWNLOAD_CONCURRENCY = 4;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function statusOf(value) {
  const status = Number(value?.status ?? value?.context?.status ?? value?.cause?.status);
  return Number.isInteger(status) ? status : null;
}

function retryableGatewayFailure(value) {
  const status = statusOf(value);
  return status === 429 || (status !== null && status >= 500 && status < 600);
}

function signedUrlMayHaveExpired(value) {
  const status = statusOf(value);
  return status === 401 || status === 403;
}

function normalizePrivateMediaImages(images) {
  const values = Array.isArray(images) ? images : [images];
  const resolved = [];
  const seen = new Set();
  values.forEach((image) => {
    const rawId = typeof image === "string" ? image : image?.id;
    const id = typeof rawId === "string" ? rawId.trim().toLowerCase() : "";
    if (!UUID_PATTERN.test(id)) throw new WorkError(WORK_ERROR_CODES.INVALID, "IMAGE IS INVALID");
    if (!seen.has(id)) {
      seen.add(id);
      resolved.push(Object.freeze({ id, image }));
    }
  });
  return resolved;
}

function validateGatewayMedia(data, requested, purpose) {
  if (data?.ok !== true || data?.purpose !== purpose || !Array.isArray(data?.media) || data.media.length !== requested.length) {
    throw { status: 502 };
  }
  return data.media.map((item, index) => {
    const imageId = typeof item?.imageId === "string" ? item.imageId.trim().toLowerCase() : "";
    const url = typeof item?.url === "string" ? item.url : "";
    const mimeType = typeof item?.mimeType === "string" ? item.mimeType : "";
    const fileSize = Number(item?.fileSize);
    if (imageId !== requested[index].id || !mimeType || !Number.isFinite(fileSize) || fileSize <= 0) throw { status: 502 };
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("invalid protocol");
    } catch { throw { status: 502 }; }
    return Object.freeze({ imageId, url, mimeType, fileSize });
  });
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = Array(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      try { results[index] = { value: await mapper(values[index]) }; }
      catch (error) { results[index] = { error }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), values.length) }, worker));
  return results;
}

async function waitForGatewayRetry(wait, random, attempt) {
  const jitter = Math.floor(Math.max(0, Math.min(1, Number(random()))) * 100);
  await wait(150 * (attempt + 1) + jitter);
}

export function createWorkMediaService(client, config = {}, {
  fetcher = fetch,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random
} = {}) {
  const urls = createObjectUrlRegistry();
  const authorize = async (images, purpose) => {
    const requested = normalizePrivateMediaImages(images);
    if (!PRIVATE_MEDIA_PURPOSES.has(purpose)) throw new WorkError(WORK_ERROR_CODES.INVALID, "MEDIA PURPOSE IS INVALID");
    const media = [];
    for (let start = 0; start < requested.length; start += PRIVATE_MEDIA_BATCH_SIZE) {
      const batch = requested.slice(start, start + PRIVATE_MEDIA_BATCH_SIZE);
      let response;
      for (let attempt = 0; attempt <= 2; attempt += 1) {
        const { data, error } = await client.functions.invoke("authorized-private-media", {
          body: { imageIds: batch.map((item) => item.id), purpose }
        });
        if (!error) {
          response = validateGatewayMedia(data, batch, purpose);
          break;
        }
        if (attempt === 2 || !retryableGatewayFailure(error)) throw error;
        await waitForGatewayRetry(wait, random, attempt);
      }
      if (!response) throw { status: 502 };
      media.push(...response);
    }
    return Object.freeze(media);
  };

  const downloadAuthorized = async (images, { purpose, concurrency = PRIVATE_MEDIA_DOWNLOAD_CONCURRENCY } = {}) => {
    const requested = normalizePrivateMediaImages(images);
    if (!requested.length) return Object.freeze([]);
    const completed = new Map();
    let pending = requested;
    let renewed = false;

    while (pending.length) {
      const signed = await authorize(pending.map((item) => item.image), purpose);
      const signedById = new Map(signed.map((item) => [item.imageId, item]));
      const results = await mapWithConcurrency(pending, concurrency, async (item) => {
        const media = signedById.get(item.id);
        if (!media) throw { status: 502 };
        const response = await fetcher(media.url, { cache: "no-store" });
        if (!response.ok) throw { status: response.status };
        return Object.freeze({ ...media, blob: await response.blob() });
      });

      const expired = [];
      results.forEach((result, index) => {
        if (result.value) completed.set(result.value.imageId, result.value);
        else if (!renewed && signedUrlMayHaveExpired(result.error)) expired.push(pending[index]);
        else throw result.error;
      });
      if (!expired.length) break;
      renewed = true;
      pending = expired;
    }

    if (completed.size !== requested.length) throw { status: 502 };
    return Object.freeze(requested.map((item) => completed.get(item.id)));
  };

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
    async authorizedPrivateMedia(images, { purpose = "preview" } = {}) {
      try { return await authorize(images, purpose); }
      catch (error) { throw sanitizeWorkError(error, "PRIVATE MEDIA IS UNAVAILABLE"); }
    },
    async downloadAuthorizedPrivateMedia(images, { purpose = "preview", concurrency = PRIVATE_MEDIA_DOWNLOAD_CONCURRENCY } = {}) {
      try { return await downloadAuthorized(images, { purpose, concurrency }); }
      catch (error) { throw sanitizeWorkError(error, "PRIVATE MEDIA IS UNAVAILABLE"); }
    },
    async privatePreviewBatch(images) {
      try {
        const previews = new Map();
        const downloaded = await downloadAuthorized(images, { purpose: "preview" });
        downloaded.forEach((media) => previews.set(media.imageId, urls.create(media.blob)));
        return previews;
      } catch (error) {
        throw sanitizeWorkError(error, "PRIVATE PREVIEW IS UNAVAILABLE");
      }
    },
    async privatePreview(image) {
      if (!image?.id) return null;
      const previews = await this.privatePreviewBatch([image]);
      return previews.get(String(image.id).trim().toLowerCase()) || null;
    },
    publicUrl(path) { return path ? client.storage.from("work-public").getPublicUrl(path).data.publicUrl : ""; },
    finalize: (id) => invoke(client, "finalize-work-image-upload", { work_image_id: id }),
    publish: (id, key) => invoke(client, "publish-work", { work_id: id, idempotency_key: key }),
    unpublish: (id, key) => invoke(client, "unpublish-work", { work_id: id, idempotency_key: key }),
    deleteImage: (id) => invoke(client, "delete-work-image", { work_image_id: id }),
    mapImage: databaseImageToClient
  });
}
