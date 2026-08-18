import { MediaError } from "./work-media.ts";
import type {
  Caller,
  MediaDependencies,
  SignedStoredObject,
  StoredObject,
  TargetKind,
} from "./work-media.ts";

export const WORK_ID = "11111111-1111-4111-8111-111111111111";
export const IMAGE_ID = "22222222-2222-4222-8222-222222222222";
export const OPERATION_ID = "33333333-3333-4333-8333-333333333333";
export const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

export function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

export async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

export function post(body: unknown, token = "valid"): Request {
  return new Request("http://local.test/function", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export type StubOptions = {
  authenticate?: (request: Request) => Promise<Caller>;
  authorize?: (request: Request, targetKind: TargetKind, targetId: string) => Promise<Caller>;
  rpc?: (name: string, body: Record<string, unknown>) => Promise<unknown>;
  download?: (bucket: string, path: string) => Promise<StoredObject>;
  upload?: (bucket: string, path: string, object: StoredObject) => Promise<void>;
  remove?: (bucket: string, paths: string[]) => Promise<boolean>;
  signPrivateOriginals?: (paths: string[], expiresIn: number) => Promise<SignedStoredObject[]>;
};

export function dependencies(options: StubOptions = {}): MediaDependencies {
  const authenticate = options.authenticate ?? (async (request: Request) => {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new MediaError(401, "authentication_required");
    if (token === "invalid") throw new MediaError(401, "invalid_session");
    if (token === "inactive") throw new MediaError(403, "inactive_account");
    return { accountId: ACCOUNT_ID };
  });

  return {
    authenticate,
    authorize: options.authorize ?? (async (request) => {
      const caller = await authenticate(request);
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (token === "unrelated" || token === "revoked") throw new MediaError(403, "not_authorized");
      return caller;
    }),
    rpc: options.rpc ?? (async () => ({})),
    download: options.download ?? (async () => ({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
      mimeType: "image/jpeg",
      size: 4,
    })),
    upload: options.upload ?? (async () => undefined),
    remove: options.remove ?? (async () => true),
    signPrivateOriginals: options.signPrivateOriginals ?? (async (paths) => paths.map((path) => ({
      path,
      url: `https://project.supabase.co/storage/v1/object/sign/work-originals/${path}?token=signed`,
    }))),
  };
}
