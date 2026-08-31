import { execSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { createSupabaseWorkRepository } from "../data/supabase-work-repository.mjs";

const PRIVATE_PREVIEW_WEBP = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAADQAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=",
  "base64"
);
const TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function localStatus() {
  const output = execSync("npx.cmd supabase status --output json", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
  });
  const match = output.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("status_unavailable");
  const status = JSON.parse(match[0]);
  const configuredApiUrl = process.env.SUPABASE_URL || process.env.SUPABASE_API_URL;
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const apiSection = config.match(/\[api\]([\s\S]*?)(?=\n\[|$)/)?.[1] || "";
  const apiPort = apiSection.match(/^\s*port\s*=\s*(\d+)\s*$/m)?.[1];
  const dbUrl = status.DB_URL ? new URL(status.DB_URL) : null;
  const endpoint = status.API_URL || configuredApiUrl || (dbUrl && apiPort ? `http://${dbUrl.hostname}:${apiPort}` : null);
  if (!endpoint) throw new Error("status_unavailable");
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("non_local_endpoint");
  return {
    api: url.origin,
    publishable: status.PUBLISHABLE_KEY || status.ANON_KEY,
    trusted: status.SERVICE_ROLE_KEY || status.SECRET_KEY
  };
}

async function jsonRequest(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { Accept: "application/json", ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { response, data };
}

function sql(statement) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_CHAINED", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-q"], {
    input: statement,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (result.status !== 0) throw new Error("trusted_fixture_failed");
}

class RestBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.method = "GET";
    this.filters = [];
    this.orders = [];
    this.columns = null;
    this.payload = undefined;
  }
  select(columns) { this.columns = columns; return this; }
  insert(payload) { this.method = "POST"; this.payload = payload; return this; }
  update(payload) { this.method = "PATCH"; this.payload = payload; return this; }
  eq(column, value) { this.filters.push([column, `eq.${value}`]); return this; }
  in(column, values) { this.filters.push([column, `in.(${values.join(",")})`]); return this; }
  order(column, options = {}) {
    let value = `${column}.${options.ascending === false ? "desc" : "asc"}`;
    if (options.nullsFirst === false) value += ".nullslast";
    this.orders.push(value);
    return this;
  }
  async execute() {
    const params = new URLSearchParams();
    if (this.columns) params.set("select", this.columns);
    for (const [key, value] of this.filters) params.append(key, value);
    if (this.orders.length) params.set("order", this.orders.join(","));
    const { response, data } = await jsonRequest(`${this.client.api}/rest/v1/${this.table}?${params}`, {
      method: this.method,
      headers: this.client.headers({ Prefer: this.method === "GET" ? "" : "return=representation" }),
      body: this.payload
    });
    if (!response.ok) return { data: null, error: { status: response.status, code: data?.code } };
    return { data: Array.isArray(data) ? data : data == null ? [] : [data], error: null };
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  async single() {
    const result = await this.execute();
    return result.error ? result : result.data.length === 1 ? { data: result.data[0], error: null } : { data: null, error: { status: 406 } };
  }
  async maybeSingle() {
    const result = await this.execute();
    return result.error ? result : { data: result.data[0] || null, error: null };
  }
}

function localClient(status, accessToken) {
  const client = {
    api: status.api,
    headers(extra = {}) { return { apikey: status.publishable, Authorization: `Bearer ${accessToken}`, ...extra }; },
    auth: { getSession: async () => ({ data: { session: { access_token: accessToken } }, error: null }) },
    from(table) { return new RestBuilder(client, table); },
    async rpc(name, body = {}) {
      const { response, data } = await jsonRequest(`${status.api}/rest/v1/rpc/${name}`, { method: "POST", headers: client.headers(), body });
      return response.ok ? { data, error: null } : { data: null, error: { status: response.status, code: data?.code } };
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, file, options) {
            const response = await fetch(`${status.api}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: client.headers({ "Content-Type": options.contentType, "x-upsert": "false" }), body: file });
            return response.ok ? { data: {}, error: null } : { data: null, error: { status: response.status } };
          },
          async download(path) {
            const response = await fetch(`${status.api}/storage/v1/object/authenticated/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: client.headers() });
            return response.ok ? { data: await response.blob(), error: null } : { data: null, error: { status: response.status } };
          },
          getPublicUrl(path) { return { data: { publicUrl: `${status.api}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}` } }; }
        };
      }
    },
    functions: {
      async invoke(name, { body }) {
        const { response, data } = await jsonRequest(`${status.api}/functions/v1/${name}`, { method: "POST", headers: client.headers(), body });
        return response.ok ? { data, error: null } : { data, error: { status: response.status } };
      }
    }
  };
  return client;
}

function createPrivatePreview() {
  return new Blob([PRIVATE_PREVIEW_WEBP], { type: "image/webp" });
}

function createPngFile() {
  const file = new Blob([TEST_PNG], { type: "image/png" });
  Object.defineProperty(file, "name", { value: "integration.png" });
  return file;
}

function sanitizeDiagnostic(error) {
  const message = error instanceof Error ? error.message : String(error || "unknown_error");
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "<redacted-database-url>")
    .replace(/https?:\/\/\S+/gi, "<redacted-url>")
    .replace(/\bBearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/\b(authorization|apikey|token|access_token|refresh_token|service_role(?:_key)?|secret(?:_key)?|password)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b/g, "<redacted-key>")
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2}\b/g, "<redacted-jwt>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export { sanitizeDiagnostic as sanitizeLocalWorkIntegrationDiagnostic };

function cleanupSqlDiagnostic(stage, result) {
  const output = [result.stderr, result.stdout].filter(Boolean).join(" ");
  const code = output.match(/\b\d{5}\b/)?.[0] || "unknown_code";
  return `${stage}:sql:${code}:${sanitizeDiagnostic(output || "cleanup_sql_failed")}`;
}

function cleanupAuthDiagnostic(identity, response, data) {
  const code = typeof data?.code === "string" ? data.code : "unknown_code";
  const message = data?.message || data?.msg || data?.error_description || "auth_cleanup_failed";
  return `delete-auth-${identity}:http:${response.status}:${code}:${sanitizeDiagnostic(message)}`;
}

function runCleanupSql(stage, statement, diagnostics) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_CHAINED", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-q"], {
    input: statement,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (result.status !== 0) diagnostics.push(cleanupSqlDiagnostic(stage, result));
}

function listFixtureStorageObjects(profileIds, workIds, workImageIds) {
  const profileList = profileIds.map((id) => `'${id}'::uuid`).join(",");
  const workCondition = workIds.length ? ` and work.id in (${workIds.map((id) => `'${id}'::uuid`).join(",")})` : "";
  const imageCondition = workImageIds.length ? ` and image.id in (${workImageIds.map((id) => `'${id}'::uuid`).join(",")})` : "";
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_CHAINED", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-q", "-t", "-A", "-F", "\t"], {
    input: `
      select 'work-originals', image.private_object_path
      from public.work_images image
      join public.works work on work.id = image.work_id
      where work.owner_profile_id in (${profileList})
        ${workCondition}
        ${imageCondition}
        and image.private_object_path is not null
      union all
      select 'work-originals', image.preview_object_path
      from public.work_images image
      join public.works work on work.id = image.work_id
      where work.owner_profile_id in (${profileList})
        ${workCondition}
        ${imageCondition}
        and image.preview_object_path is not null
      union all
      select 'work-public', image.public_object_path
      from public.work_images image
      join public.works work on work.id = image.work_id
      where work.owner_profile_id in (${profileList})
        ${workCondition}
        ${imageCondition}
        and image.public_object_path is not null
      union all
      select derivative.staging_bucket, derivative.staging_object_path
      from private.work_image_derivatives derivative
      join public.work_images image on image.id = derivative.work_image_id
      join public.works work on work.id = image.work_id
      where work.owner_profile_id in (${profileList})
        ${workCondition}
        ${imageCondition};
    `,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (result.status !== 0) return { objects: new Map(), diagnostic: cleanupSqlDiagnostic("delete-test-storage-objects", result) };

  const objects = new Map();
  for (const row of result.stdout.trim().split(/\r?\n/)) {
    if (!row) continue;
    const [bucket, path] = row.split("\t");
    if (!bucket || !path) continue;
    if (!objects.has(bucket)) objects.set(bucket, []);
    if (!objects.get(bucket).includes(path)) objects.get(bucket).push(path);
  }
  return { objects, diagnostic: null };
}

function storageCleanupDiagnostic(bucket, response, data) {
  const code = typeof data?.code === "string" ? data.code : "unknown_code";
  const message = data?.message || data?.msg || data?.error || "storage_cleanup_failed";
  return `delete-test-storage-objects:${bucket}:http:${response.status}:${code}:${sanitizeDiagnostic(message)}`;
}

function storageListDiagnostic(bucket, response, data) {
  const code = typeof data?.code === "string" ? data.code : "unknown_code";
  const message = data?.message || data?.msg || data?.error || "storage_list_failed";
  return `delete-test-storage-objects:${bucket}:list:http:${response.status}:${code}:${sanitizeDiagnostic(message)}`;
}

function addFixtureStoragePath(objects, bucket, path) {
  if (!objects.has(bucket)) objects.set(bucket, []);
  if (!objects.get(bucket).includes(path)) objects.get(bucket).push(path);
}

async function recoverRetainedFixtureStorageObjects(resources, objects, diagnostics) {
  const recovery = resources.storageRecovery;
  if (!recovery) return;

  const prefix = `${recovery.ownerProfileId}/${recovery.workId}/${recovery.imageId}/`;
  try {
    const { response, data } = await jsonRequest(`${resources.status.api}/storage/v1/object/list/work-originals`, {
      method: "POST",
      headers: resources.trustedHeaders,
      body: { prefix, limit: 10, offset: 0, sortBy: { column: "name", order: "asc" } }
    });
    if (!response.ok) {
      diagnostics.push(storageListDiagnostic("work-originals", response, data));
      return;
    }
    if (!Array.isArray(data)) {
      diagnostics.push("delete-test-storage-objects:work-originals:list:unknown_code:storage_list_response_invalid");
      return;
    }
    for (const entry of data) {
      const name = typeof entry?.name === "string" ? entry.name : "";
      if (/^(?:original\.(?:jpg|jpeg|png|webp)|preview\.webp)$/.test(name)) {
        addFixtureStoragePath(objects, "work-originals", `${prefix}${name}`);
      }
    }
  } catch (error) {
    diagnostics.push(`delete-test-storage-objects:work-originals:list:request:unknown_code:${sanitizeDiagnostic(error)}`);
  }
}

async function deleteFixtureStorageObjects(resources, profileIds, workIds, workImageIds, diagnostics) {
  if (!profileIds.length) return;
  const { objects, diagnostic } = listFixtureStorageObjects(profileIds, workIds, workImageIds);
  if (diagnostic) {
    diagnostics.push(diagnostic);
    return;
  }
  await recoverRetainedFixtureStorageObjects(resources, objects, diagnostics);

  for (const [bucket, paths] of objects) {
    try {
      const { response, data } = await jsonRequest(`${resources.status.api}/storage/v1/object/${bucket}`, {
        method: "DELETE",
        headers: resources.trustedHeaders,
        body: { prefixes: paths }
      });
      if (!response.ok && response.status !== 404) diagnostics.push(storageCleanupDiagnostic(bucket, response, data));
    } catch (error) {
      diagnostics.push(`delete-test-storage-objects:${bucket}:request:unknown_code:${sanitizeDiagnostic(error)}`);
    }
  }
}

async function cleanupFixture(resources) {
  const diagnostics = [];
  const profileIds = resources.profileIds;
  const accountIds = resources.accountIds;
  const workIds = resources.workIds || [];
  const workImageIds = resources.workImageIds || [];

  if (resources.status && (profileIds.length || accountIds.length)) {
    const profileList = profileIds.map((id) => `'${id}'::uuid`).join(",");
    const accountList = accountIds.map((id) => `'${id}'::uuid`).join(",");
    const workList = workIds.map((id) => `'${id}'::uuid`).join(",");
    const workImageList = workImageIds.map((id) => `'${id}'::uuid`).join(",");
    const workScope = workIds.length ? `work.id in (${workList})` : `work.owner_profile_id in (${profileList})`;
    const workImageScope = workImageIds.length ? `image.id in (${workImageList})` : `image.work_id in (select id from public.works where owner_profile_id in (${profileList}))`;
    const workIdScope = workIds.length ? `id in (${workList})` : `owner_profile_id in (${profileList})`;
    await deleteFixtureStorageObjects(resources, profileIds, workIds, workImageIds, diagnostics);
    if (profileIds.length) runCleanupSql("delete-test-publication-operation-images", `
      delete from public.work_publication_operation_images
      where work_image_id in (
        select image.id
        from public.work_images image
        join public.works work on work.id = image.work_id
        where ${workScope}
          and (${workImageScope})
      );
    `, diagnostics);
    if (profileIds.length) runCleanupSql("delete-test-publication-derivatives", `
      delete from public.work_publication_derivatives
      where work_image_id in (
        select image.id
        from public.work_images image
        join public.works work on work.id = image.work_id
        where ${workScope}
          and (${workImageScope})
      );
    `, diagnostics);
    if (profileIds.length) runCleanupSql("delete-test-work-images", `
      delete from public.work_images image where (${workImageScope});
    `, diagnostics);
    if (profileIds.length) runCleanupSql("delete-test-publication-operations", `
      delete from public.work_publication_operations operation
      where operation.work_id in (select id from public.works where ${workIdScope});
    `, diagnostics);
    if (profileIds.length) runCleanupSql("delete-test-works", `
      delete from public.works where ${workIdScope};
    `, diagnostics);
    if (resources.grantId) runCleanupSql("delete-test-delegation-grant", `
      delete from public.profile_access_grants where id='${resources.grantId}'::uuid;
    `, diagnostics);
    if (profileIds.length) runCleanupSql("delete-test-profile-memberships", `
      delete from public.profile_members where profile_id in (${profileList});
    `, diagnostics);
    if (profileIds.length) runCleanupSql("delete-test-profiles", `
      delete from public.public_profiles where id in (${profileList});
    `, diagnostics);
    if (accountIds.length) runCleanupSql("delete-test-account-roles", `
      delete from public.account_roles where account_id in (${accountList});
    `, diagnostics);
    if (accountIds.length) runCleanupSql("delete-test-accounts", `
      delete from public.accounts where id in (${accountList});
    `, diagnostics);
  }

  for (const [index, id] of accountIds.entries()) {
    const identity = index === 0 ? "owner" : index === 1 ? "delegate" : "fixture-user";
    try {
      const { response, data } = await jsonRequest(`${resources.status.api}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: resources.trustedHeaders });
      if (!response.ok && response.status !== 404) diagnostics.push(cleanupAuthDiagnostic(identity, response, data));
    } catch (error) {
      diagnostics.push(`delete-auth-${identity}:request:unknown_code:${sanitizeDiagnostic(error)}`);
    }
  }

  if (diagnostics.length) throw new Error(`fixture_cleanup_failed: ${[...new Set(diagnostics)].join(";")}`);
}

export async function cleanupLocalWorkIntegrationFixture({
  ownerProfileId,
  delegateProfileId,
  ownerAccountId,
  delegateAccountId,
  workId,
  imageId,
  grantId = null
}) {
  const status = localStatus();
  await cleanupFixture({
    status,
    trustedHeaders: { apikey: status.trusted, Authorization: `Bearer ${status.trusted}` },
    profileIds: [ownerProfileId, delegateProfileId],
    accountIds: [ownerAccountId, delegateAccountId],
    workIds: workId ? [workId] : [],
    workImageIds: imageId ? [imageId] : [],
    storageRecovery: workId && imageId ? { ownerProfileId, workId, imageId } : null,
    grantId
  });
}

export async function createLocalWorkIntegrationFixture({ onStage = () => {} } = {}) {
  const resources = { status: null, trustedHeaders: null, accountIds: [], profileIds: [], grantId: null };

  try {
    onStage("reading local status");
    const status = localStatus();
    resources.status = status;
    resources.trustedHeaders = { apikey: status.trusted, Authorization: `Bearer ${status.trusted}` };
    const runId = randomUUID();
    const suffix = `${Date.now()}-${runId}`;
    const ownerEmail = `work-owner-${suffix}@example.test`;
    const delegateEmail = `work-delegate-${suffix}@example.test`;
    const password = randomBytes(36).toString("base64url");

    onStage("creating local identities");
    const ownerCreate = await jsonRequest(`${status.api}/auth/v1/admin/users`, { method: "POST", headers: resources.trustedHeaders, body: { email: ownerEmail, password, email_confirm: true } });
    if (!ownerCreate.response.ok || !ownerCreate.data?.id) throw new Error("local_auth_fixture_failed");
    const ownerId = ownerCreate.data.id;
    resources.accountIds.push(ownerId);
    const delegateCreate = await jsonRequest(`${status.api}/auth/v1/admin/users`, { method: "POST", headers: resources.trustedHeaders, body: { email: delegateEmail, password, email_confirm: true } });
    if (!delegateCreate.response.ok || !delegateCreate.data?.id) throw new Error("local_auth_fixture_failed");
    const delegateId = delegateCreate.data.id;
    resources.accountIds.push(delegateId);

    const artistId = randomUUID();
    const institutionId = randomUUID();
    const grantId = randomUUID();
    const escapedSuffix = suffix.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    onStage("creating local workspace fixtures");
    sql(`
      begin;
      insert into public.accounts (id,status,display_name) values ('${ownerId}'::uuid,'active','INTEGRATION OWNER'),('${delegateId}'::uuid,'active','INTEGRATION DELEGATE');
      insert into public.account_roles (account_id,role) values ('${ownerId}'::uuid,'private_member'),('${ownerId}'::uuid,'artist'),('${delegateId}'::uuid,'private_member'),('${delegateId}'::uuid,'institution');
      insert into public.public_profiles (id,profile_type,slug,display_name,publication_status,published_at,claim_state,primary_controller_account_id,claimed_at,created_by_account_id) values
        ('${artistId}'::uuid,'artist','integration-artist-${escapedSuffix}','INTEGRATION ARTIST','published',now(),'claimed','${ownerId}'::uuid,now(),'${ownerId}'::uuid),
        ('${institutionId}'::uuid,'institution','integration-institution-${escapedSuffix}','INTEGRATION INSTITUTION','published',now(),'claimed',null,null,'${delegateId}'::uuid);
      insert into public.profile_members (profile_id,account_id,membership_level,status) values ('${artistId}'::uuid,'${ownerId}'::uuid,'owner','active'),('${institutionId}'::uuid,'${delegateId}'::uuid,'manager','active');
      insert into public.profile_access_grants (id,grantor_profile_id,grantee_profile_id,scope,status,granted_by_account_id) values ('${grantId}'::uuid,'${artistId}'::uuid,'${institutionId}'::uuid,'works_editor','active','${ownerId}'::uuid);
      commit;
    `);
    resources.profileIds.push(artistId, institutionId);
    resources.grantId = grantId;

    onStage("opening local sessions");
    const ownerSession = await jsonRequest(`${status.api}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: status.publishable }, body: { email: ownerEmail, password } });
    const delegateSession = await jsonRequest(`${status.api}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: status.publishable }, body: { email: delegateEmail, password } });
    if (!ownerSession.response.ok || !delegateSession.response.ok) throw new Error("local_sign_in_failed");
    const ownerClient = localClient(status, ownerSession.data.access_token);
    const delegateClient = localClient(status, delegateSession.data.access_token);

    return {
      status,
      runId,
      ownerId,
      delegateId,
      artistId,
      institutionId,
      grantId,
      ownerClient,
      delegateClient,
      ownerRepository: createSupabaseWorkRepository(ownerClient, { supabaseUrl: status.api, supabaseKey: status.publishable }, { createPreview: createPrivatePreview }),
      delegateRepository: createSupabaseWorkRepository(delegateClient, { supabaseUrl: status.api, supabaseKey: status.publishable }),
      createPngFile,
      runSql: sql,
      cleanup: () => cleanupFixture(resources)
    };
  } catch (error) {
    try {
      await cleanupFixture(resources);
    } catch (cleanupError) {
      throw new Error(`${sanitizeDiagnostic(error)}; fixture cleanup failed: ${sanitizeDiagnostic(cleanupError)}`, { cause: error });
    }
    throw error;
  }
}
