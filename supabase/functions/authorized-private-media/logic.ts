import {
  asRecord,
  asRecords,
  errorResponse,
  jsonResponse,
  MediaError,
  parseStrictJson,
  requirePost,
  requireUuid,
} from "../_shared/work-media.ts";
import type {
  Caller,
  MediaDependencies,
  SignedStoredObject,
} from "../_shared/work-media.ts";

export const PRIVATE_MEDIA_MAX_REQUEST_BYTES = 8 * 1024;
export const PRIVATE_MEDIA_MAX_IMAGE_IDS = 100;
export const PRIVATE_MEDIA_TTLS = Object.freeze({
  preview: 300,
  pdf_export: 900,
});

type PrivateMediaPurpose = keyof typeof PRIVATE_MEDIA_TTLS;

export type AuthorizedPrivateMediaDependencies = {
  authenticate(request: Request): Promise<Caller>;
  rpc(name: string, body: Record<string, unknown>): Promise<unknown>;
  signPrivateOriginals(paths: string[], expiresIn: number): Promise<SignedStoredObject[]>;
  now(): Date;
};

export function createAuthorizedPrivateMediaDependencies(
  dependencies: MediaDependencies,
): AuthorizedPrivateMediaDependencies {
  return {
    authenticate: dependencies.authenticate,
    rpc: dependencies.rpc,
    signPrivateOriginals: dependencies.signPrivateOriginals,
    now: () => new Date(),
  };
}

function requirePurpose(value: unknown): PrivateMediaPurpose {
  if (value !== "preview" && value !== "pdf_export") {
    throw new MediaError(400, "invalid_purpose");
  }
  return value;
}

function requireImageIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new MediaError(400, "invalid_image_ids");
  }

  const uniqueIds: string[] = [];
  const seen = new Set<string>();
  for (const valueId of value) {
    let imageId: string;
    try {
      imageId = requireUuid(valueId, "image_id");
    } catch {
      throw new MediaError(400, "invalid_image_ids");
    }
    if (!seen.has(imageId)) {
      seen.add(imageId);
      uniqueIds.push(imageId);
    }
  }

  if (uniqueIds.length > PRIVATE_MEDIA_MAX_IMAGE_IDS) {
    throw new MediaError(413, "too_many_images");
  }
  return uniqueIds;
}

function mediaUnavailable(error: unknown): never {
  if (error instanceof MediaError && (error.status === 403 || error.status === 404 || error.status === 422)) {
    throw new MediaError(403, "media_unavailable");
  }
  throw error;
}

function resolvedImages(value: unknown, requestedIds: string[]): Record<string, unknown>[] {
  const context = asRecord(value);
  const images = asRecords(context.images);
  if (images.length !== requestedIds.length) {
    throw new MediaError(500, "workflow_state_invalid");
  }

  const requested = new Set(requestedIds);
  const returned = new Set<string>();
  for (const image of images) {
    const imageId = requireUuid(image.work_image_id, "resolved_image_id");
    const objectPath = typeof image.object_path === "string" ? image.object_path : "";
    const mimeType = typeof image.mime_type === "string" ? image.mime_type : "";
    const fileSize = Number(image.file_size);
    if (!requested.has(imageId) || returned.has(imageId) || !objectPath || !mimeType || !Number.isFinite(fileSize) || fileSize <= 0) {
      throw new MediaError(500, "workflow_state_invalid");
    }
    returned.add(imageId);
  }
  return images;
}

export async function handleAuthorizedPrivateMedia(
  request: Request,
  dependencies: AuthorizedPrivateMediaDependencies,
): Promise<Response> {
  try {
    requirePost(request);
    const body = await parseStrictJson(
      request,
      ["imageIds", "purpose"],
      PRIVATE_MEDIA_MAX_REQUEST_BYTES,
    );
    const imageIds = requireImageIds(body.imageIds);
    const purpose = requirePurpose(body.purpose);
    const caller = await dependencies.authenticate(request);

    let resolved: unknown;
    try {
      resolved = await dependencies.rpc("service_resolve_authorized_private_work_images", {
        actor_account_id: caller.accountId,
        image_ids: imageIds,
      });
    } catch (error) {
      mediaUnavailable(error);
    }

    const images = resolvedImages(resolved, imageIds);
    const paths = images.map((image) => String(image.object_path));
    const expiresIn = PRIVATE_MEDIA_TTLS[purpose];
    const signed = await dependencies.signPrivateOriginals(paths, expiresIn);
    if (signed.length !== paths.length) throw new MediaError(502, "signing_unavailable");

    const signedByPath = new Map(signed.map((item) => [item.path, item.url]));
    const media = images.map((image) => {
      const objectPath = String(image.object_path);
      const url = signedByPath.get(objectPath);
      if (!url) throw new MediaError(502, "signing_unavailable");
      return {
        imageId: String(image.work_image_id),
        url,
        mimeType: String(image.mime_type),
        fileSize: Number(image.file_size),
      };
    });

    return jsonResponse(200, {
      ok: true,
      purpose,
      expiresAt: new Date(dependencies.now().getTime() + expiresIn * 1000).toISOString(),
      media,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
