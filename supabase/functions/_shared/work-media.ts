import {
  elevatedServiceHeaders,
  resolveSupabaseApiKeys,
  userScopedHeaders,
} from "./supabase-api-keys.ts";
import type { SupabaseApiKey } from "./supabase-api-keys.ts";

export const MAX_REQUEST_BYTES = 4096;
export const ORIGINAL_BUCKET = "work-originals";
export const PUBLIC_BUCKET = "work-public";

export type TargetKind = "work" | "work_image";

export type Caller = {
  accountId: string;
};

export type StoredObject = {
  bytes: Uint8Array;
  mimeType: string;
  size: number;
};

export type SignedStoredObject = {
  path: string;
  url: string;
};

export type MediaDependencies = {
  authenticate(request: Request): Promise<Caller>;
  authorize(request: Request, targetKind: TargetKind, targetId: string): Promise<Caller>;
  rpc(name: string, body: Record<string, unknown>): Promise<unknown>;
  download(bucket: string, path: string): Promise<StoredObject>;
  upload(bucket: string, path: string, object: StoredObject): Promise<void>;
  remove(bucket: string, paths: string[]): Promise<boolean>;
  signPrivateOriginals(paths: string[], expiresIn: number): Promise<SignedStoredObject[]>;
};

export class MediaError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function jsonResponse(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof MediaError) {
    return jsonResponse(error.status, { ok: false, error: error.code });
  }
  return jsonResponse(500, { ok: false, error: "internal_error" });
}

export async function parseStrictJson(
  request: Request,
  allowedKeys: string[],
  maximumBytes = MAX_REQUEST_BYTES,
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new MediaError(413, "request_too_large");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new MediaError(413, "request_too_large");
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new MediaError(400, "invalid_json");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MediaError(400, "invalid_request");
  }

  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    throw new MediaError(400, "invalid_request");
  }
  return body;
}

export function requirePost(request: Request): void {
  if (request.method !== "POST") {
    throw new MediaError(405, "method_not_allowed");
  }
}

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new MediaError(400, `invalid_${field}`);
  }
  return value.toLowerCase();
}

export function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireUuid(value, field);
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MediaError(500, "workflow_state_invalid");
  }
  return value as Record<string, unknown>;
}

export function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function expectedExtension(mimeType: string): string | null {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  }[mimeType] ?? null;
}

function hasSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  if (mimeType === "image/avif") {
    if (bytes.length < 16 || String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") return false;
    const brands = String.fromCharCode(...bytes.slice(8, Math.min(bytes.length, 64)));
    return brands.includes("avif") || brands.includes("avis");
  }
  return false;
}

export function validateStoredObject(
  object: StoredObject,
  expectedMimeType: string,
  expectedSize: number,
  path: string,
): void {
  if (object.size <= 0 || object.bytes.byteLength <= 0) {
    throw new MediaError(422, "object_empty");
  }
  if (object.size !== expectedSize || object.bytes.byteLength !== expectedSize) {
    throw new MediaError(422, "object_size_mismatch");
  }
  if (object.mimeType.toLowerCase() !== expectedMimeType.toLowerCase()) {
    throw new MediaError(422, "object_mime_mismatch");
  }
  const extension = expectedExtension(expectedMimeType);
  if (!extension || !path.toLowerCase().endsWith(`.${extension}`)) {
    throw new MediaError(422, "object_extension_mismatch");
  }
  if (!hasSignature(object.bytes, expectedMimeType)) {
    throw new MediaError(422, "object_signature_mismatch");
  }
}

function encodeObjectPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function absoluteSignedStorageUrl(apiUrl: string, signedUrl: string): string {
  const projectUrl = new URL(apiUrl);
  const storageUrl = `${projectUrl.origin}/storage/v1`;
  const candidate = signedUrl.startsWith("http://") || signedUrl.startsWith("https://")
    ? new URL(signedUrl)
    : signedUrl.startsWith("/storage/v1/")
    ? new URL(`${projectUrl.origin}${signedUrl}`)
    : new URL(`${storageUrl}${signedUrl.startsWith("/") ? "" : "/"}${signedUrl}`);
  const expectedPrefix = `/storage/v1/object/sign/${ORIGINAL_BUCKET}/`;

  if (candidate.origin !== projectUrl.origin || !candidate.pathname.startsWith(expectedPrefix)) {
    throw new MediaError(502, "signing_unavailable");
  }
  return candidate.toString();
}

export async function signPrivateOriginalUrls(
  apiUrl: string,
  secretKey: SupabaseApiKey,
  paths: string[],
  expiresIn: number,
  fetcher: typeof fetch = fetch,
): Promise<SignedStoredObject[]> {
  if (secretKey.kind !== "current") {
    throw new MediaError(502, "signing_unavailable");
  }

  let response: Response;
  try {
    response = await fetcher(`${apiUrl}/storage/v1/object/sign/${ORIGINAL_BUCKET}`, {
      method: "POST",
      headers: elevatedServiceHeaders(secretKey, {
        "content-type": "application/json",
      }),
      body: JSON.stringify({ expiresIn, paths }),
    });
  } catch {
    throw new MediaError(502, "signing_unavailable");
  }
  if (!response.ok) throw new MediaError(502, "signing_unavailable");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MediaError(502, "signing_unavailable");
  }
  if (!Array.isArray(payload) || payload.length !== paths.length) {
    throw new MediaError(502, "signing_unavailable");
  }

  const expectedPaths = new Set(paths);
  const signedByPath = new Map<string, SignedStoredObject>();
  for (const value of payload) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new MediaError(502, "signing_unavailable");
    }
    const item = value as Record<string, unknown>;
    const path = typeof item.path === "string" ? item.path : "";
    const rawSignedUrl = typeof item.signedURL === "string" ? item.signedURL : "";
    if (!expectedPaths.has(path) || signedByPath.has(path) || item.error || !rawSignedUrl) {
      throw new MediaError(502, "signing_unavailable");
    }
    try {
      signedByPath.set(path, {
        path,
        url: absoluteSignedStorageUrl(apiUrl, rawSignedUrl),
      });
    } catch {
      throw new MediaError(502, "signing_unavailable");
    }
  }

  return paths.map((path) => {
    const signed = signedByPath.get(path);
    if (!signed) throw new MediaError(502, "signing_unavailable");
    return signed;
  });
}

export function createMediaDependencies(): MediaDependencies {
  const apiUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const apiKeys = resolveSupabaseApiKeys((name) => Deno.env.get(name));

  if (!apiUrl) {
    throw new Error("Local Supabase function environment is incomplete.");
  }

  const fetchRows = async (path: string, jwt: string): Promise<Record<string, unknown>[]> => {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: userScopedHeaders(apiKeys.publishable, jwt),
    });
    if (!response.ok) throw new MediaError(403, "not_authorized");
    const value = await response.json();
    return Array.isArray(value) ? value : [];
  };

  const authenticate = async (request: Request): Promise<Caller> => {
    const authorization = request.headers.get("authorization");
    if (!authorization?.match(/^Bearer\s+\S+$/i)) {
      throw new MediaError(401, "authentication_required");
    }

    const userResponse = await fetch(`${apiUrl}/auth/v1/user`, {
      headers: userScopedHeaders(apiKeys.publishable, authorization),
    });
    if (!userResponse.ok) throw new MediaError(401, "invalid_session");
    const user = await userResponse.json() as { id?: unknown };
    const accountId = requireUuid(user.id, "session");

    const accounts = await fetchRows(
      `/rest/v1/accounts?id=eq.${encodeURIComponent(accountId)}&status=eq.active&select=id&limit=1`,
      authorization,
    );
    if (accounts.length !== 1) throw new MediaError(403, "inactive_account");
    return { accountId };
  };

  return {
    authenticate,
    async authorize(request, targetKind, targetId) {
      const caller = await authenticate(request);
      const authorization = request.headers.get("authorization") as string;

      const targetPath = targetKind === "work"
        ? `/rest/v1/works?id=eq.${encodeURIComponent(targetId)}&select=id&limit=1`
        : `/rest/v1/work_images?id=eq.${encodeURIComponent(targetId)}&select=id,work_id&limit=1`;
      const targets = await fetchRows(targetPath, authorization);
      if (targets.length !== 1) throw new MediaError(403, "not_authorized");

      return caller;
    },

    async rpc(name, body) {
      const response = await fetch(`${apiUrl}/rest/v1/rpc/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: elevatedServiceHeaders(apiKeys.secret, {
          "content-type": "application/json",
        }),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        if (response.status === 409) throw new MediaError(409, "conflicting_operation");
        if (response.status === 400) throw new MediaError(422, "workflow_rejected");
        if (response.status === 403 || response.status === 404) throw new MediaError(403, "not_authorized");
        throw new MediaError(500, "workflow_failed");
      }
      return await response.json();
    },

    async download(bucket, path) {
      const response = await fetch(
        `${apiUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodeObjectPath(path)}`,
        { headers: elevatedServiceHeaders(apiKeys.secret) },
      );
      if (!response.ok) throw new MediaError(404, "object_missing");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const mimeType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
      return { bytes, mimeType, size: bytes.byteLength };
    },

    async upload(bucket, path, object) {
      const response = await fetch(
        `${apiUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeObjectPath(path)}`,
        {
          method: "POST",
          headers: elevatedServiceHeaders(apiKeys.secret, {
            "content-type": object.mimeType,
            "cache-control": "31536000",
            "x-upsert": "false",
          }),
          body: object.bytes as unknown as BodyInit,
        },
      );
      if (!response.ok) throw new MediaError(502, "copy_failed");
    },

    async remove(bucket, paths) {
      if (paths.length === 0) return true;
      const response = await fetch(`${apiUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: "DELETE",
        headers: elevatedServiceHeaders(apiKeys.secret, {
          "content-type": "application/json",
        }),
        body: JSON.stringify({ prefixes: [...new Set(paths)] }),
      });
      return response.ok;
    },

    async signPrivateOriginals(paths, expiresIn) {
      return await signPrivateOriginalUrls(apiUrl, apiKeys.secret, paths, expiresIn);
    },
  };
}
