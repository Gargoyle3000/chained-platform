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

function authenticatedHeaders(config, accessToken) {
  return { apikey: config.supabaseKey, Authorization: `Bearer ${accessToken}` };
}

function diagnosticUrl(supabaseUrl, path) {
  return new URL(path, supabaseUrl).toString();
}

function decodeJwtPayload(accessToken) {
  try {
    const encoded = String(accessToken).split(".")[1];
    if (!encoded || typeof atob !== "function") return null;
    const padded = `${encoded.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - (encoded.length % 4)) % 4)}`;
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}

function tokenFacts(accessToken, sessionUserId, authUserId, supabaseUrl) {
  const claims = decodeJwtPayload(accessToken);
  const audience = claims?.aud;
  const audienceValid = audience === "authenticated" || (Array.isArray(audience) && audience.includes("authenticated"));
  const expiresAt = Number(claims?.exp);
  return {
    expectedUserIdentityMatches: claims?.sub && sessionUserId && authUserId && claims.sub === sessionUserId && claims.sub === authUserId ? "YES" : "NO",
    role: claims?.role === "authenticated" ? "authenticated" : claims?.role ? "other" : "UNKNOWN",
    audienceValid: claims ? audienceValid ? "YES" : "NO" : "UNKNOWN",
    issuerValid: claims ? claims.iss === diagnosticUrl(supabaseUrl, "/auth/v1") ? "YES" : "NO" : "UNKNOWN",
    tokenExpired: Number.isFinite(expiresAt) ? expiresAt <= Date.now() / 1000 ? "YES" : "NO" : "UNKNOWN"
  };
}

async function responseErrorCode(response) {
  try {
    const body = await response.clone().json();
    const code = body?.code || body?.error || body?.errorCode;
    return new Set(["NoSuchKey", "not_found", "InvalidJWT", "Unauthorized", "Forbidden", "AccessDenied"]).has(code) ? code : "UNKNOWN";
  } catch { return "UNKNOWN"; }
}

function requestId(response) {
  return response.headers.get("x-request-id") || response.headers.get("x-amzn-requestid") || null;
}

async function validateAuthenticatedUser(config, accessToken, sessionUserId, fetcher) {
  try {
    const response = await fetcher(diagnosticUrl(config.supabaseUrl, "/auth/v1/user"), {
      headers: { ...authenticatedHeaders(config, accessToken), Accept: "application/json" },
      cache: "no-store"
    });
    let authUserId = null;
    if (response.ok) {
      try { authUserId = (await response.json())?.id || null; } catch { /* Validation status is still useful. */ }
    }
    return {
      authValidation: response.ok ? "PASS" : "FAIL",
      authStatus: response.status,
      ...tokenFacts(accessToken, sessionUserId, authUserId, config.supabaseUrl)
    };
  } catch {
    return { authValidation: "FAIL", authStatus: "NETWORK", ...tokenFacts(accessToken, sessionUserId, null, config.supabaseUrl) };
  }
}

async function validateManagedImageContext(config, accessToken, image, fetcher) {
  if (!image?.id || !image?.workId) return { postgrestAuthorization: "SKIPPED", postgrestStatus: "SKIPPED", exactImageContextMatches: "UNKNOWN" };
  try {
    const response = await fetcher(diagnosticUrl(config.supabaseUrl, "/rest/v1/rpc/list_managed_work_images"), {
      method: "POST",
      headers: { ...authenticatedHeaders(config, accessToken), Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ target_work_id: image.workId }),
      cache: "no-store"
    });
    let exactImageContextMatches = "UNKNOWN";
    if (response.ok) {
      try {
        const rows = await response.json();
        exactImageContextMatches = Array.isArray(rows) && rows.some((row) => row.id === image.id && row.work_id === image.workId && row.private_object_path === image.privatePath) ? "YES" : "NO";
      } catch { /* The authorization result is still useful. */ }
    }
    return { postgrestAuthorization: response.ok ? "PASS" : "FAIL", postgrestStatus: response.status, exactImageContextMatches };
  } catch { return { postgrestAuthorization: "FAIL", postgrestStatus: "NETWORK", exactImageContextMatches: "UNKNOWN" }; }
}

// Temporary incident diagnostic: remove after the ordinary-user Storage context is identified.
async function diagnosePrivateStorageFailure(config, accessToken, sessionUserId, image, storageFailure, fetcher, logger) {
  const [auth, postgrest] = await Promise.all([
    validateAuthenticatedUser(config, accessToken, sessionUserId, fetcher),
    validateManagedImageContext(config, accessToken, image, fetcher)
  ]);
  try {
    logger?.error?.("[PRIVATE MEDIA DIAGNOSTIC]", {
      ...auth,
      ...postgrest,
      storageRetrieval: "FAIL",
      storageStatus: storageFailure.status,
      storageErrorCode: storageFailure.errorCode,
      storageRequestId: storageFailure.requestId,
      sameCapturedAccessToken: "YES"
    });
  } catch { /* Diagnostics must not replace the original private-media error. */ }
}

async function downloadPrivateOriginal(client, config, image, fetcher, logger) {
  const { data, error } = await client.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw error || new Error("Session unavailable.");

  let response;
  try {
    response = await fetcher(authenticatedObjectUrl(config.supabaseUrl, "work-originals", image.privatePath), {
      headers: authenticatedHeaders(config, accessToken),
      cache: "no-store"
    });
  } catch (error) {
    await diagnosePrivateStorageFailure(config, accessToken, data?.session?.user?.id || null, image, { status: "NETWORK", errorCode: "NETWORK_ERROR", requestId: null }, fetcher, logger);
    throw error;
  }
  if (!response.ok) {
    await diagnosePrivateStorageFailure(config, accessToken, data?.session?.user?.id || null, image, { status: response.status, errorCode: await responseErrorCode(response), requestId: requestId(response) }, fetcher, logger);
    throw { status: response.status };
  }
  return response.blob();
}

export function createWorkMediaService(client, config = {}, { fetcher = fetch, logger = console } = {}) {
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
        return urls.create(await downloadPrivateOriginal(client, config, image, fetcher, logger));
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
