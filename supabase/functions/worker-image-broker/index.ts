import { elevatedServiceHeaders, resolveSupabaseApiKeys } from "../_shared/supabase-api-keys.ts";
import { MediaError, signPrivateOriginalUrls } from "../_shared/work-media.ts";
import { handleWorkerImageBroker, STAGING_BUCKET } from "./logic.ts";

const apiUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
if (!apiUrl) throw new Error("Local Supabase function environment is incomplete.");
const keys = resolveSupabaseApiKeys((name) => Deno.env.get(name));
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const dependencies = {
  workerToken: Deno.env.get("CHAINED_IMAGE_WORKER_TOKEN"),
  async rpc(name: string, body: Record<string, unknown>) {
    const response = await fetch(`${apiUrl}/rest/v1/rpc/${encodeURIComponent(name)}`, { method: "POST", headers: elevatedServiceHeaders(keys.secret, { "content-type": "application/json" }), body: JSON.stringify(body) });
    if (!response.ok) throw new MediaError(response.status === 403 ? 409 : 502, response.status === 403 ? "job_unavailable" : "broker_rpc_failed");
    return await response.json();
  },
  async signSource(path: string, expiresIn: number) {
    return (await signPrivateOriginalUrls(apiUrl, keys.secret, [path], expiresIn, fetch, Deno.env.get("SUPABASE_PUBLIC_URL")))[0]!.url;
  },
  async signUpload(path: string) {
    const response = await fetch(`${apiUrl}/storage/v1/object/upload/sign/${STAGING_BUCKET}/${encodePath(path)}`, { method: "POST", headers: elevatedServiceHeaders(keys.secret, { "content-type": "application/json", "x-upsert": "false" }), body: "{}" });
    if (!response.ok) throw new Error("upload_signing_failed");
    const value = await response.json() as { url?: unknown; token?: unknown };
    if (typeof value.url !== "string" || typeof value.token !== "string") throw new Error("upload_signing_failed");
    return { url: /^https?:\/\//i.test(value.url) ? value.url : `${apiUrl}/storage/v1/${value.url.replace(/^\/+/, "")}`, token: value.token };
  },
  async downloadStaging(path: string) {
    const response = await fetch(`${apiUrl}/storage/v1/object/authenticated/${STAGING_BUCKET}/${encodePath(path)}`, { headers: elevatedServiceHeaders(keys.secret) });
    if (!response.ok) throw new MediaError(422, "missing_output");
    return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim() };
  },
};
Deno.serve((request) => handleWorkerImageBroker(request, dependencies));
