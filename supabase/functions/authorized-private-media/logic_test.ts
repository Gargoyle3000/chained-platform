import {
  MediaError,
  signPrivateOriginalUrls,
} from "../_shared/work-media.ts";
import type { SupabaseApiKey } from "../_shared/supabase-api-keys.ts";
import {
  ACCOUNT_ID,
  assert,
  IMAGE_ID,
  post,
  responseJson,
} from "../_shared/work-media-test-helpers.ts";
import {
  handleAuthorizedPrivateMedia,
  PRIVATE_MEDIA_MAX_IMAGE_IDS,
  PRIVATE_MEDIA_TTLS,
} from "./logic.ts";
import type { AuthorizedPrivateMediaDependencies } from "./logic.ts";

const SECOND_IMAGE_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-08-18T12:00:00.000Z");
const USER_JWT = "ordinary-user-session-value";
const CURRENT_SECRET = "current-secret-value";
const LEGACY_SECRET = "legacy-service-value";

function image(imageId: string) {
  return {
    work_image_id: imageId,
    object_path: `owner/work/${imageId}/original.webp`,
    mime_type: "image/webp",
    file_size: 1234,
  };
}

function gatewayDependencies(
  options: Partial<AuthorizedPrivateMediaDependencies> = {},
): AuthorizedPrivateMediaDependencies {
  return {
    authenticate: options.authenticate ?? (async (request) => {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!token) throw new MediaError(401, "authentication_required");
      if (token === "invalid") throw new MediaError(401, "invalid_session");
      if (token === "inactive") throw new MediaError(403, "inactive_account");
      return { accountId: ACCOUNT_ID };
    }),
    rpc: options.rpc ?? (async (_name, body) => ({
      images: (body.image_ids as string[]).map(image),
    })),
    signPrivateOriginals: options.signPrivateOriginals ?? (async (paths) => paths.map((path) => ({
      path,
      url: `https://project.supabase.co/storage/v1/object/sign/work-originals/${path}?token=signed`,
    }))),
    now: options.now ?? (() => NOW),
  };
}

Deno.test("private-media gateway rejects non-POST and missing, invalid, or inactive sessions", async () => {
  assert((await handleAuthorizedPrivateMedia(new Request("http://local.test"), gatewayDependencies())).status === 405);

  const missing = post({ imageIds: [IMAGE_ID], purpose: "preview" });
  missing.headers.delete("authorization");
  assert((await handleAuthorizedPrivateMedia(missing, gatewayDependencies())).status === 401);
  assert((await handleAuthorizedPrivateMedia(post({ imageIds: [IMAGE_ID], purpose: "preview" }, "invalid"), gatewayDependencies())).status === 401);
  assert((await handleAuthorizedPrivateMedia(post({ imageIds: [IMAGE_ID], purpose: "preview" }, "inactive"), gatewayDependencies())).status === 403);
});

Deno.test("private-media gateway deduplicates IDs in first-seen order and signs one whole preview batch", async () => {
  const rpcBodies: Record<string, unknown>[] = [];
  let signedPaths: string[] = [];
  let signedTtl = 0;
  const response = await handleAuthorizedPrivateMedia(
    post({ imageIds: [SECOND_IMAGE_ID, IMAGE_ID, SECOND_IMAGE_ID], purpose: "preview" }, USER_JWT),
    gatewayDependencies({
      rpc: async (name, body) => {
        assert(name === "service_resolve_authorized_private_work_images");
        rpcBodies.push(body);
        return { images: (body.image_ids as string[]).map(image) };
      },
      signPrivateOriginals: async (paths, expiresIn) => {
        signedPaths = paths;
        signedTtl = expiresIn;
        return paths.map((path) => ({ path, url: `https://project.supabase.co/storage/v1/object/sign/work-originals/${path}?token=signed` }));
      },
    }),
  );
  const body = await responseJson(response);
  const media = body.media as Record<string, unknown>[];

  assert(response.status === 200);
  assert(JSON.stringify(rpcBodies[0]?.image_ids) === JSON.stringify([SECOND_IMAGE_ID, IMAGE_ID]));
  assert(rpcBodies[0]?.actor_account_id === ACCOUNT_ID);
  assert(signedPaths.length === 2 && signedTtl === PRIVATE_MEDIA_TTLS.preview);
  assert(media.length === 2 && media[0].imageId === SECOND_IMAGE_ID && media[1].imageId === IMAGE_ID);
  assert(body.expiresAt === "2026-08-18T12:05:00.000Z");
  assert(!JSON.stringify(body).includes("object_path") && !JSON.stringify(body).includes("bucket"));
});

Deno.test("private-media gateway uses the exact PDF TTL and does not accept a caller TTL", async () => {
  let ttl = 0;
  const response = await handleAuthorizedPrivateMedia(
    post({ imageIds: [IMAGE_ID], purpose: "pdf_export" }),
    gatewayDependencies({
      signPrivateOriginals: async (paths, expiresIn) => {
        ttl = expiresIn;
        return paths.map((path) => ({ path, url: `https://project.supabase.co/storage/v1/object/sign/work-originals/${path}?token=signed` }));
      },
    }),
  );
  const body = await responseJson(response);
  assert(response.status === 200 && ttl === PRIVATE_MEDIA_TTLS.pdf_export);
  assert(body.expiresAt === "2026-08-18T12:15:00.000Z");

  for (const injected of [
    { path: "forged" },
    { bucket: "forged" },
    { ttl: 999999 },
    { expiresIn: 999999 },
    { workId: IMAGE_ID },
  ]) {
    const rejected = await handleAuthorizedPrivateMedia(
      post({ imageIds: [IMAGE_ID], purpose: "preview", ...injected }),
      gatewayDependencies(),
    );
    assert(rejected.status === 400);
  }
});

Deno.test("private-media gateway rejects invalid image lists, purpose, and body size before signing", async () => {
  let signed = false;
  const dependencies = gatewayDependencies({
    signPrivateOriginals: async () => {
      signed = true;
      return [];
    },
  });
  const invalidBodies = [
    { imageIds: [], purpose: "preview" },
    { imageIds: "not-an-array", purpose: "preview" },
    { imageIds: ["not-a-uuid"], purpose: "preview" },
    { imageIds: [IMAGE_ID], purpose: "other" },
  ];
  for (const body of invalidBodies) {
    const response = await handleAuthorizedPrivateMedia(post(body), dependencies);
    assert(response.status === 400);
  }

  const ids = Array.from({ length: PRIVATE_MEDIA_MAX_IMAGE_IDS + 1 }, (_, index) => {
    const first = String(index + 1).padStart(8, "0");
    const last = String(index + 1).padStart(12, "0");
    return `${first}-0000-4000-8000-${last}`;
  });
  assert((await handleAuthorizedPrivateMedia(post({ imageIds: ids, purpose: "preview" }), dependencies)).status === 413);
  assert((await handleAuthorizedPrivateMedia(
    post(JSON.stringify({ imageIds: [IMAGE_ID], purpose: "preview", padding: "x".repeat(9000) })),
    dependencies,
  )).status === 413);
  assert(!signed);
});

Deno.test("fake, unrelated, and mixed image batches share one unavailable response and never sign", async () => {
  for (const upstreamCode of ["not_authorized", "workflow_rejected"]) {
    let signed = false;
    const response = await handleAuthorizedPrivateMedia(
      post({ imageIds: [IMAGE_ID, SECOND_IMAGE_ID], purpose: "preview" }),
      gatewayDependencies({
        rpc: async () => {
          throw new MediaError(upstreamCode === "not_authorized" ? 403 : 422, upstreamCode);
        },
        signPrivateOriginals: async () => {
          signed = true;
          return [];
        },
      }),
    );
    const body = await responseJson(response);
    assert(response.status === 403 && body.error === "media_unavailable" && !signed);
  }
});

Deno.test("private-media gateway never returns partial signed results", async () => {
  const response = await handleAuthorizedPrivateMedia(
    post({ imageIds: [IMAGE_ID, SECOND_IMAGE_ID], purpose: "preview" }),
    gatewayDependencies({
      signPrivateOriginals: async (paths) => [{ path: paths[0], url: "https://project.supabase.co/one" }],
    }),
  );
  const body = await responseJson(response);
  assert(response.status === 502 && body.error === "signing_unavailable");
  assert(!JSON.stringify(body).includes("url"));
});

Deno.test("bulk signer uses a current secret only in apikey and sends the server TTL", async () => {
  const currentSecret: SupabaseApiKey = { value: CURRENT_SECRET, kind: "current" };
  let requestUrl = "";
  let requestHeaders = new Headers();
  let requestBody: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify([{
      path: image(IMAGE_ID).object_path,
      signedURL: `/object/sign/work-originals/${image(IMAGE_ID).object_path}?token=signed`,
      error: null,
    }]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const signed = await signPrivateOriginalUrls(
    "https://project.supabase.co",
    currentSecret,
    [image(IMAGE_ID).object_path],
    PRIVATE_MEDIA_TTLS.preview,
    fetcher,
  );

  assert(requestUrl === "https://project.supabase.co/storage/v1/object/sign/work-originals");
  assert(requestHeaders.get("apikey") === CURRENT_SECRET);
  assert(requestHeaders.get("authorization") === null);
  assert(requestBody.expiresIn === PRIVATE_MEDIA_TTLS.preview);
  assert(JSON.stringify(requestBody.paths) === JSON.stringify([image(IMAGE_ID).object_path]));
  assert(signed.length === 1 && signed[0].url.includes("/storage/v1/object/sign/work-originals/"));
});

Deno.test("bulk signer fails closed for legacy keys, partial responses, and foreign URLs", async () => {
  const legacySecret: SupabaseApiKey = { value: LEGACY_SECRET, kind: "legacy" };
  let fetched = false;
  await assertRejects(
    () => signPrivateOriginalUrls("https://project.supabase.co", legacySecret, [image(IMAGE_ID).object_path], 300, async () => {
      fetched = true;
      return new Response("[]");
    }),
    "signing_unavailable",
  );
  assert(!fetched);

  const currentSecret: SupabaseApiKey = { value: CURRENT_SECRET, kind: "current" };
  await assertRejects(
    () => signPrivateOriginalUrls("https://project.supabase.co", currentSecret, [image(IMAGE_ID).object_path], 300, async () => new Response("[]", { status: 200 })),
    "signing_unavailable",
  );
  await assertRejects(
    () => signPrivateOriginalUrls("https://project.supabase.co", currentSecret, [image(IMAGE_ID).object_path], 300, async () => {
      throw new Error("network details must be sanitized");
    }),
    "signing_unavailable",
  );
  await assertRejects(
    () => signPrivateOriginalUrls("https://project.supabase.co", currentSecret, [image(IMAGE_ID).object_path], 300, async () => new Response(JSON.stringify([{
      path: image(IMAGE_ID).object_path,
      signedURL: "https://evil.example/storage/v1/object/sign/work-originals/path?token=stolen",
      error: null,
    }]), { status: 200 })),
    "signing_unavailable",
  );
});

Deno.test("private-media code does not log JWTs, secrets, image IDs, or signed URLs", async () => {
  const entries: unknown[][] = [];
  const originals = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  const capture = (...entry: unknown[]) => entries.push(entry);
  console.debug = capture;
  console.error = capture;
  console.info = capture;
  console.log = capture;
  console.warn = capture;

  try {
    await handleAuthorizedPrivateMedia(
      post({ imageIds: [IMAGE_ID], purpose: "preview" }, USER_JWT),
      gatewayDependencies(),
    );
  } finally {
    console.debug = originals.debug;
    console.error = originals.error;
    console.info = originals.info;
    console.log = originals.log;
    console.warn = originals.warn;
  }

  const output = JSON.stringify(entries);
  assert(entries.length === 0);
  assert(!output.includes(USER_JWT) && !output.includes(CURRENT_SECRET) && !output.includes(IMAGE_ID) && !output.includes("token=signed"));
});

async function assertRejects(action: () => Promise<unknown>, expectedCode: string): Promise<void> {
  let thrown: unknown;
  try {
    await action();
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof MediaError && thrown.code === expectedCode);
}
