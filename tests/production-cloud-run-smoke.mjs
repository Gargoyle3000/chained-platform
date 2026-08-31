import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { createSupabaseWorkRepository } from "../data/supabase-work-repository.mjs";
import { createRgbJpegFile } from "./local-work-integration-fixture.mjs";

const EXPECTED = Object.freeze({
  projectRef: "jjtobvxjmbnybbxlvnxs",
  supabaseUrl: "https://jjtobvxjmbnybbxlvnxs.supabase.co",
  cloudProject: "chained-507212",
  cloudService: "chained-image-worker",
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const localEnvFile = new URL("./.local/production-cloud-run-smoke.env", import.meta.url);

function loadLocalSmokeEnvironment() {
  if (!existsSync(localEnvFile)) return;
  for (const line of readFileSync(localEnvFile, "utf8").split(/\r?\n/)) {
    const match = /^(CHAINED_PRODUCTION_SUPABASE_(?:PUBLISHABLE|SECRET)_KEY)=(.+)$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function sanitize(error) {
  return String(error instanceof Error ? error.message : error || "unknown_error")
    .replace(/https?:\/\/\S+/gi, "<redacted-url>")
    .replace(/\bBearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/\b(?:apikey|authorization|token|access_token|refresh_token|secret(?:_key)?|service_role(?:_key)?|password)\s*[:=]\s*\S+/gi, "<redacted>")
    .replace(/\b(?:sb_(?:publishable|secret)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2})\b/g, "<redacted>")
    .replace(/\s+/g, " ").trim().slice(0, 240);
}

function requireGuard(name, value, expected) {
  if (value !== expected) throw new Error(`production_smoke_guard_failed:${name}`);
  return value;
}

function readConfiguration() {
  loadLocalSmokeEnvironment();
  if (process.env.CHAINED_PRODUCTION_SMOKE !== "1") throw new Error("production_smoke_guard_failed:explicit_opt_in");
  const api = requireGuard("supabase_url", process.env.CHAINED_PRODUCTION_SUPABASE_URL, EXPECTED.supabaseUrl);
  requireGuard("supabase_ref", process.env.CHAINED_PRODUCTION_SUPABASE_REF, EXPECTED.projectRef);
  requireGuard("cloud_project", process.env.CHAINED_PRODUCTION_CLOUD_RUN_PROJECT, EXPECTED.cloudProject);
  requireGuard("cloud_service", process.env.CHAINED_PRODUCTION_CLOUD_RUN_SERVICE, EXPECTED.cloudService);
  const proxyUrl = process.env.CHAINED_PRODUCTION_CLOUD_RUN_PROXY_URL || "";
  let proxy;
  try { proxy = new URL(proxyUrl); } catch { throw new Error("production_smoke_guard_failed:cloud_run_proxy_url"); }
  if (proxy.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(proxy.hostname) || !proxy.port) {
    throw new Error("production_smoke_guard_failed:cloud_run_proxy_url");
  }
  const publishable = process.env.CHAINED_PRODUCTION_SUPABASE_PUBLISHABLE_KEY || "";
  const trusted = process.env.CHAINED_PRODUCTION_SUPABASE_SECRET_KEY || "";
  if (!publishable || !trusted) throw new Error("production_smoke_guard_failed:credentials");
  return { api, proxy: proxy.origin, publishable, trusted };
}

async function request(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { Accept: "application/json", ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { response, data, text };
}

function productionSql(sql, stage) {
  const command = `npx.cmd supabase db query --linked --output json "${sql.replaceAll("\"", "\\\"")}"`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) fail(`${stage}:sql:${sanitize(result.stderr || result.stdout || result.error?.message || "failed")}`);
  const output = result.stdout.trim();
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) fail(`${stage}:sql:invalid_response`);
  try {
    const parsed = JSON.parse(output.slice(jsonStart));
    if (!Array.isArray(parsed.rows)) fail(`${stage}:sql:invalid_rows`);
    return parsed.rows;
  } catch {
    fail(`${stage}:sql:invalid_response`);
  }
}

function fail(code) { throw new Error(code); }
function requireOk(result, code) { if (!result.response.ok) fail(`${code}:http:${result.response.status}:${typeof result.data?.code === "string" ? result.data.code : "unknown"}`); return result.data; }
function serviceHeaders(config) { return { apikey: config.trusted }; }
function userHeaders(config, token, extra = {}) { return { apikey: config.publishable, Authorization: `Bearer ${token}`, ...extra }; }
function encodePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }

class RestBuilder {
  constructor(client, table) { this.client = client; this.table = table; this.method = "GET"; this.filters = []; this.payload = undefined; this.columns = null; }
  select(columns) { this.columns = columns; return this; }
  insert(payload) { this.method = "POST"; this.payload = payload; return this; }
  update(payload) { this.method = "PATCH"; this.payload = payload; return this; }
  eq(column, value) { this.filters.push([column, `eq.${value}`]); return this; }
  in(column, values) { this.filters.push([column, `in.(${values.join(",")})`]); return this; }
  order() { return this; }
  async execute() {
    const query = new URLSearchParams();
    if (this.columns) query.set("select", this.columns);
    for (const [key, value] of this.filters) query.append(key, value);
    const result = await request(`${this.client.api}/rest/v1/${this.table}?${query}`, {
      method: this.method,
      headers: userHeaders(this.client.config, this.client.token, this.method === "GET" ? {} : { Prefer: "return=representation" }),
      body: this.payload,
    });
    return result.response.ok ? { data: Array.isArray(result.data) ? result.data : result.data == null ? [] : [result.data], error: null } : { data: null, error: { status: result.response.status, code: result.data?.code } };
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  async single() { const result = await this.execute(); return result.error ? result : result.data.length === 1 ? { data: result.data[0], error: null } : { data: null, error: { status: 406 } }; }
  async maybeSingle() { const result = await this.execute(); return result.error ? result : { data: result.data[0] || null, error: null }; }
}

function productionClient(config, token) {
  const client = {
    api: config.api,
    config,
    token,
    auth: { getSession: async () => ({ data: { session: { access_token: token } }, error: null }) },
    from(table) { return new RestBuilder(client, table); },
    async rpc(name, body = {}) {
      const result = await request(`${config.api}/rest/v1/rpc/${encodeURIComponent(name)}`, { method: "POST", headers: userHeaders(config, token), body });
      return result.response.ok ? { data: result.data, error: null } : { data: null, error: { status: result.response.status, code: result.data?.code } };
    },
    storage: { from(bucket) { return {
      async upload(path, file, options) {
        const response = await fetch(`${config.api}/storage/v1/object/${bucket}/${encodePath(path)}`, { method: "POST", headers: userHeaders(config, token, { "Content-Type": options.contentType, "x-upsert": "false" }), body: file });
        return response.ok ? { data: {}, error: null } : { data: null, error: { status: response.status } };
      },
      async download(path) {
        const response = await fetch(`${config.api}/storage/v1/object/authenticated/${bucket}/${encodePath(path)}`, { headers: userHeaders(config, token) });
        return response.ok ? { data: await response.blob(), error: null } : { data: null, error: { status: response.status } };
      },
      getPublicUrl(path) { return { data: { publicUrl: `${config.api}/storage/v1/object/public/${bucket}/${encodePath(path)}` } }; },
    }; } },
    functions: { async invoke(name, { body }) {
      const result = await request(`${config.api}/functions/v1/${encodeURIComponent(name)}`, { method: "POST", headers: userHeaders(config, token), body });
      return result.response.ok ? { data: result.data, error: null } : { data: result.data, error: { status: result.response.status } };
    } },
  };
  return client;
}

async function admin(config, path, options = {}) { return request(`${config.api}${path}`, { ...options, headers: { ...serviceHeaders(config), ...(options.headers || {}) } }); }
async function removeStorage(config, bucket, paths) {
  if (!paths.length) return;
  const result = await admin(config, `/storage/v1/object/${encodeURIComponent(bucket)}`, { method: "DELETE", body: { prefixes: paths } });
  if (!result.response.ok && result.response.status !== 404) requireOk(result, `storage_delete_${bucket}`);
}
async function storageObject(config, bucket, path) {
  const response = await fetch(`${config.api}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodePath(path)}`, { headers: serviceHeaders(config) });
  if (!response.ok) fail(`storage_read_${bucket}:http:${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, mimeType: (response.headers.get("content-type") || "").split(";", 1)[0], hash: createHash("sha256").update(bytes).digest("hex") };
}
function exactRows(table, id) {
  return productionSql(`select id from public.${table} where id = '${id}'::uuid`, `verify_${table}`);
}

async function cleanup(config, state, userToken) {
  const diagnostics = [];
  const attempt = async (code, action) => { try { await action(); } catch (error) { diagnostics.push(`${code}:${sanitize(error)}`); } };
  const original = state.privateObjectPath ? [state.privateObjectPath, state.previewObjectPath].filter(Boolean) : [];
  const staging = state.privateObjectPath ? [
    state.privateObjectPath.replace(/\/original\.[^/]+$/, "/public-derivatives/small.webp"),
    state.privateObjectPath.replace(/\/original\.[^/]+$/, "/public-derivatives/large.webp"),
  ] : [];
  await attempt("storage_staging", () => removeStorage(config, "work-derivative-staging", staging));
  if (state.imageId && userToken) await attempt("delete_image", async () => {
    const result = await request(`${config.api}/functions/v1/delete-work-image`, { method: "POST", headers: userHeaders(config, userToken), body: { work_image_id: state.imageId } });
    if (!result.response.ok) requireOk(result, "delete_image");
  });
  await attempt("storage_originals", () => removeStorage(config, "work-originals", original));
  for (const [code, table, id] of [
    ["work_images", "work_images", state.imageId], ["works", "works", state.workId], ["profile_members", "profile_members", state.profileMemberId],
    ["profiles", "public_profiles", state.profileId], ["account_roles_member", "account_roles", state.memberRoleId], ["account_roles_artist", "account_roles", state.artistRoleId], ["accounts", "accounts", state.accountId],
  ]) {
    if (!id) continue;
    await attempt(`delete_${code}`, async () => { productionSql(`delete from public.${table} where id = '${id}'::uuid`, `delete_${code}`); });
  }
  if (state.accountId) await attempt("auth_user", async () => { const result = await admin(config, `/auth/v1/admin/users/${encodeURIComponent(state.accountId)}`, { method: "DELETE" }); if (!result.response.ok && result.response.status !== 404) requireOk(result, "delete_auth_user"); });
  if (diagnostics.length) throw new Error(`production_smoke_cleanup_failed:${diagnostics.join(";")}`);
}

const state = { runId: null, accountId: null, profileId: null, profileMemberId: null, memberRoleId: null, artistRoleId: null, workId: null, imageId: null, derivativeJobId: null, privateObjectPath: null, previewObjectPath: null };
let config;
let sessionToken = null;
let primaryError = null;

try {
  config = readConfiguration();
  state.runId = randomUUID();
  const suffix = state.runId.replaceAll("-", "");
  const password = randomBytes(36).toString("base64url");
  const email = `chained-production-smoke-${suffix}@example.test`;
  const auth = requireOk(await admin(config, "/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } }), "create_auth_user");
  if (!UUID.test(auth?.id || "")) fail("create_auth_user:invalid_id");
  state.accountId = auth.id;
  state.profileId = randomUUID();
  state.profileMemberId = randomUUID();
  state.memberRoleId = randomUUID();
  state.artistRoleId = randomUUID();
  const profileSlug = `production-smoke-${suffix}`;

  productionSql(`insert into public.accounts (id, status, display_name) values ('${state.accountId}'::uuid, 'active', 'CHAINED PRODUCTION SMOKE')`, "create_account");
  productionSql(`insert into public.account_roles (id, account_id, role) values ('${state.memberRoleId}'::uuid, '${state.accountId}'::uuid, 'private_member'), ('${state.artistRoleId}'::uuid, '${state.accountId}'::uuid, 'artist')`, "create_roles");
  productionSql(`insert into public.public_profiles (id, profile_type, slug, display_name, publication_status, claim_state, primary_controller_account_id, claimed_at, created_by_account_id) values ('${state.profileId}'::uuid, 'artist', '${profileSlug}', 'CHAINED PRODUCTION SMOKE', 'draft', 'claimed', '${state.accountId}'::uuid, statement_timestamp(), '${state.accountId}'::uuid)`, "create_profile");
  productionSql(`insert into public.profile_members (id, profile_id, account_id, membership_level, status, granted_by_account_id) values ('${state.profileMemberId}'::uuid, '${state.profileId}'::uuid, '${state.accountId}'::uuid, 'owner', 'active', '${state.accountId}'::uuid)`, "create_profile_member");

  const session = requireOk(await request(`${config.api}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: config.publishable }, body: { email, password } }), "create_session");
  if (typeof session?.access_token !== "string") fail("create_session:missing_token");
  sessionToken = session.access_token;
  const client = productionClient(config, sessionToken);
  const repository = createSupabaseWorkRepository(client, { supabaseUrl: config.api, supabaseKey: config.publishable }, { createPreview: () => new Blob([Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAADQAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=", "base64")], { type: "image/webp" }) });
  const work = await repository.createWork({ title: "CHAINED PRODUCTION DERIVATIVE SMOKE", year: "2026", workType: "single-work", format: "digital", materials: "RGB JPEG TEST FIXTURE", height: "64", width: "96", depth: "", dimensionUnit: "cm", duration: "", edition: "", description: "Unpublished production infrastructure smoke fixture.", collaboratorName: "", collaboratorUrl: "", photoCreditName: "", photoCreditUrl: "" }, state.profileId);
  state.workId = work.id;
  await repository.media.upload(state.workId, createRgbJpegFile(), true, () => {});
  const image = (await repository.getWork(state.workId))?.images?.[0];
  if (!image?.id || image.uploadStatus !== "ready") fail("finalize_image:not_ready");
  state.imageId = image.id;
  const imageRow = productionSql(`select id, work_id, private_object_path, preview_object_path, upload_status, original_verified_at, pixel_width, pixel_height from public.work_images where id = '${state.imageId}'::uuid`, "read_finalized_image")[0];
  const verificationFailures = [
    ["row", Boolean(imageRow)],
    ["work", imageRow?.work_id === state.workId],
    ["status", imageRow?.upload_status === "ready"],
    ["verified", Boolean(imageRow?.original_verified_at)],
    ["width", Number(imageRow?.pixel_width) === 96],
    ["height", Number(imageRow?.pixel_height) === 64],
    ["original_path", typeof imageRow?.private_object_path === "string"],
    ["preview_path", typeof imageRow?.preview_object_path === "string"],
  ].filter(([, valid]) => !valid).map(([field]) => field);
  if (verificationFailures.length) fail(`finalize_image:verification_failed:${verificationFailures.join(",")}`);
  state.privateObjectPath = imageRow.private_object_path;
  state.previewObjectPath = imageRow.preview_object_path;
  const pending = productionSql(`select public.service_enqueue_work_image_derivatives('${state.imageId}'::uuid, '${state.accountId}'::uuid) as result`, "read_pending_derivative_job")[0]?.result;
  if (!UUID.test(pending?.job_id || "") || pending.status !== "pending") fail("pending_derivative_job:verification_failed");
  state.derivativeJobId = pending.job_id;
  const health = await fetch(`${config.proxy}/health`);
  if (!health.ok || (await health.json())?.ok !== true) fail("cloud_run_health_failed");
  const processed = await request(`${config.proxy}/process-job`, { method: "POST", body: { job_id: state.derivativeJobId } });
  const processResult = requireOk(processed, "cloud_run_process_job");
  if (processResult?.job_id !== state.derivativeJobId || processResult?.state !== "ready") fail("cloud_run_process_job:invalid_response");
  const ready = productionSql(`select public.service_enqueue_work_image_derivatives('${state.imageId}'::uuid, '${state.accountId}'::uuid) as result`, "read_ready_derivative_job")[0]?.result;
  if (ready?.job_id !== state.derivativeJobId || ready?.status !== "ready" || ready?.idempotent !== true) fail("ready_derivative_job:verification_failed");
  const stagingPaths = [
    state.privateObjectPath.replace(/\/original\.[^/]+$/, "/public-derivatives/small.webp"),
    state.privateObjectPath.replace(/\/original\.[^/]+$/, "/public-derivatives/large.webp"),
  ];
  const [small, large] = await Promise.all(stagingPaths.map((path) => storageObject(config, "work-derivative-staging", path)));
  for (const output of [small, large]) if (output.mimeType !== "image/webp" || output.bytes.byteLength <= 0) fail("staging_output:verification_failed");
  const beforeReplay = [small.hash, large.hash, small.bytes.byteLength, large.bytes.byteLength];
  const replay = await request(`${config.proxy}/process-job`, { method: "POST", body: { job_id: state.derivativeJobId } });
  if (replay.response.ok || replay.response.status !== 502) fail("ready_job_replay:verification_failed");
  const [smallReplay, largeReplay] = await Promise.all(stagingPaths.map((path) => storageObject(config, "work-derivative-staging", path)));
  if (JSON.stringify(beforeReplay) !== JSON.stringify([smallReplay.hash, largeReplay.hash, smallReplay.bytes.byteLength, largeReplay.bytes.byteLength])) fail("ready_job_replay:output_changed");
  await cleanup(config, state, sessionToken);
  const [accountRows, profileRows, workRows, imageRowsAfter] = [exactRows("accounts", state.accountId), exactRows("public_profiles", state.profileId), exactRows("works", state.workId), exactRows("work_images", state.imageId)];
  if (accountRows.length || profileRows.length || workRows.length || imageRowsAfter.length) fail("cleanup:public_rows_remain");
  const authAfter = await admin(config, `/auth/v1/admin/users/${encodeURIComponent(state.accountId)}`);
  if (authAfter.response.status !== 404) fail("cleanup:auth_user_remains");
  process.stdout.write(JSON.stringify({ ok: true, runId: state.runId, fixture: { accountId: state.accountId, profileId: state.profileId, workId: state.workId, imageId: state.imageId, derivativeJobId: state.derivativeJobId }, outputs: { small: { bytes: small.bytes.byteLength, sha256: small.hash }, large: { bytes: large.bytes.byteLength, sha256: large.hash } }, cleanup: "complete" }));
} catch (error) {
  primaryError = error;
  let cleanupError = null;
  if (config && state.accountId) {
    try { await cleanup(config, state, sessionToken); } catch (value) { cleanupError = value; }
  }
  process.stderr.write(`Production Cloud Run smoke failed: ${sanitize(primaryError)}${cleanupError ? `; cleanup: ${sanitize(cleanupError)}` : ""}.`);
  process.stdout.write(JSON.stringify({ ok: false, runId: state.runId, fixture: { accountId: state.accountId, profileId: state.profileId, workId: state.workId, imageId: state.imageId, derivativeJobId: state.derivativeJobId } }));
  process.exitCode = 1;
}
