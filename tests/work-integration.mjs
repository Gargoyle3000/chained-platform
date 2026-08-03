import { execSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createSupabaseWorkRepository } from "../data/supabase-work-repository.mjs";

const outcomes = [];
let stage = "reading local status";

function record(name, condition) {
  assert.equal(Boolean(condition), true, name);
  outcomes.push(name);
}

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
  const url = new URL(status.API_URL);
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

function sql(status, statement) {
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

try {
  const status = localStatus();
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const ownerEmail = `work-owner-${suffix}@example.test`;
  const delegateEmail = `work-delegate-${suffix}@example.test`;
  const password = randomBytes(36).toString("base64url");
  const trustedHeaders = { apikey: status.trusted, Authorization: `Bearer ${status.trusted}` };

  stage = "creating local identities";
  const ownerCreate = await jsonRequest(`${status.api}/auth/v1/admin/users`, { method: "POST", headers: trustedHeaders, body: { email: ownerEmail, password, email_confirm: true } });
  const delegateCreate = await jsonRequest(`${status.api}/auth/v1/admin/users`, { method: "POST", headers: trustedHeaders, body: { email: delegateEmail, password, email_confirm: true } });
  assert.equal(ownerCreate.response.ok && delegateCreate.response.ok, true);
  const ownerId = ownerCreate.data.id;
  const delegateId = delegateCreate.data.id;
  const artistId = randomUUID();
  const institutionId = randomUUID();
  const grantId = randomUUID();
  const escapedSuffix = suffix.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  stage = "creating local workspace fixtures";
  sql(status, `
    insert into public.accounts (id,status,display_name) values ('${ownerId}'::uuid,'active','INTEGRATION OWNER'),('${delegateId}'::uuid,'active','INTEGRATION DELEGATE');
    insert into public.account_roles (account_id,role) values ('${ownerId}'::uuid,'private_member'),('${ownerId}'::uuid,'artist'),('${delegateId}'::uuid,'private_member'),('${delegateId}'::uuid,'institution');
    insert into public.public_profiles (id,profile_type,slug,display_name,publication_status,published_at,claim_state,primary_controller_account_id,claimed_at,created_by_account_id) values
      ('${artistId}'::uuid,'artist','integration-artist-${escapedSuffix}','INTEGRATION ARTIST','published',now(),'claimed','${ownerId}'::uuid,now(),'${ownerId}'::uuid),
      ('${institutionId}'::uuid,'institution','integration-institution-${escapedSuffix}','INTEGRATION INSTITUTION','published',now(),'claimed',null,null,'${delegateId}'::uuid);
    insert into public.profile_members (profile_id,account_id,membership_level,status) values ('${artistId}'::uuid,'${ownerId}'::uuid,'owner','active'),('${institutionId}'::uuid,'${delegateId}'::uuid,'manager','active');
    insert into public.profile_access_grants (id,grantor_profile_id,grantee_profile_id,scope,status,granted_by_account_id) values ('${grantId}'::uuid,'${artistId}'::uuid,'${institutionId}'::uuid,'works_editor','active','${ownerId}'::uuid);
  `);

  stage = "opening local sessions";
  const ownerSession = await jsonRequest(`${status.api}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: status.publishable }, body: { email: ownerEmail, password } });
  const delegateSession = await jsonRequest(`${status.api}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: status.publishable }, body: { email: delegateEmail, password } });
  assert.equal(ownerSession.response.ok && delegateSession.response.ok, true);
  const ownerClient = localClient(status, ownerSession.data.access_token);
  const delegateClient = localClient(status, delegateSession.data.access_token);
  const ownerRepository = createSupabaseWorkRepository(ownerClient, { supabaseUrl: status.api, supabaseKey: status.publishable });
  const delegateRepository = createSupabaseWorkRepository(delegateClient, { supabaseUrl: status.api, supabaseKey: status.publishable });

  stage = "testing repository metadata flow";
  const profiles = await ownerRepository.listManagedProfiles();
  record("one managed artist profile resolves", profiles.length === 1 && profiles[0].id === artistId);
  record("empty Supabase Work list renders", (await ownerRepository.listWorks([artistId])).length === 0);
  const form = { title: "INTEGRATION WORK", year: "2026", workType: "single-work", format: "digital", primaryMedium: "DIGITAL IMAGE", supportBase: "VARIABLE SUPPORT", additionalMaterials: "LIGHT, STEEL", height: "10", width: "20", depth: "", dimensionUnit: "cm", duration: "", edition: "1/1", description: "LOCAL INTEGRATION", collaboratorName: "CHAINED TEST", collaboratorUrl: "https://example.com/collaborator", photoCreditName: "LOCAL TEST", photoCreditUrl: "https://example.com/photo" };
  let work = await ownerRepository.createWork(form, artistId);
  record("draft is created through the repository mapping", work.visibility === "draft" && work.title === "INTEGRATION WORK");
  work = await ownerRepository.getWork(work.id);
  record("refresh reloads the Supabase Work", work?.additionalMaterials === "LIGHT, STEEL");
  const staleTimestamp = work.updatedAt;
  work = await ownerRepository.updateWork({ ...work, title: "INTEGRATION WORK EDITED" }, staleTimestamp);
  record("metadata editing persists", work.title === "INTEGRATION WORK EDITED");
  let staleDetected = false;
  try { await ownerRepository.updateWork({ ...work, title: "STALE WRITE" }, staleTimestamp); } catch (error) { staleDetected = error.code === "conflict"; }
  record("stale metadata update is detected", staleDetected);

  stage = "testing delegated access";
  record("valid delegated gallery can read the Work", (await delegateRepository.getWork(work.id))?.title === "INTEGRATION WORK EDITED");
  sql(status, `update public.profile_access_grants set status='revoked',revoked_at=now(),revoked_by_account_id='${ownerId}'::uuid where id='${grantId}'::uuid;`);
  record("revoked delegation fails immediately", (await delegateRepository.getWork(work.id)) === null);

  stage = "testing media workflow";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const file = new Blob([png], { type: "image/png" });
  Object.defineProperty(file, "name", { value: "integration.png" });
  const stages = [];
  await ownerRepository.media.upload(work.id, file, true, (value) => stages.push(value));
  work = await ownerRepository.getWork(work.id);
  record("reserve upload finalize reaches ready", stages.join(",") === "RESERVING,UPLOADING,VERIFYING,READY" && work.images.length === 1 && work.images[0].uploadStatus === "ready");
  const privatePath = work.images[0].privatePath;
  const publicPathBeforePublish = work.images[0].publicPath;
  const previewUrl = await ownerRepository.media.privatePreview(work.images[0]);
  record("authorised private preview loads", typeof previewUrl === "string" && previewUrl.startsWith("blob:"));
  ownerRepository.media.urls.revoke(previewUrl);
  const anonymousPrivate = await fetch(`${status.api}/storage/v1/object/authenticated/work-originals/${privatePath.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: status.publishable } });
  record("anonymous private-original access is denied", !anonymousPrivate.ok);

  stage = "testing publication workflow";
  const publishKey = randomUUID();
  const publication = await ownerRepository.media.publish(work.id, publishKey);
  record("publication succeeds", publication.status === "published");
  work = await ownerRepository.getWork(work.id);
  const publishedPublicPath = work.images[0].publicPath;
  const publicWork = await ownerRepository.getPublishedWork(work.id);
  record("anonymous artwork data and public image load", publicWork?.visibility === "published" && (await fetch(publicWork.images[0].src)).ok);
  const publicationRetry = await ownerRepository.media.publish(work.id, publishKey);
  record("publication retry is idempotent", publicationRetry.idempotent === true && work.images.length === 1);

  stage = "testing unpublication and deletion";
  const unpublication = await ownerRepository.media.unpublish(work.id, randomUUID());
  record("unpublication hides public artwork", unpublication.status === "draft" && (await ownerRepository.getPublishedWork(work.id)) === null);
  const oldPublicResponse = await fetch(`${status.api}/storage/v1/object/public/work-public/${publishedPublicPath.split("/").map(encodeURIComponent).join("/")}`);
  const privateAfterUnpublish = await ownerClient.storage.from("work-originals").download(privatePath);
  record("public copy is removed and private original remains", !oldPublicResponse.ok && !privateAfterUnpublish.error);
  const deletion = await ownerRepository.media.deleteImage(work.images[0].id);
  work = await ownerRepository.getWork(work.id);
  record("image deletion removes the original", deletion.status === "deleted" && work.images.length === 0 && (await ownerClient.storage.from("work-originals").download(privatePath)).error !== null);
  await ownerRepository.deleteWork(work.id);
  record("soft deletion hides Work from dashboard list", (await ownerRepository.listWorks([artistId])).length === 0);

  record("prototype IndexedDB contract remains unchanged", /databaseName = "chained-works"/.test(await (await import("node:fs/promises")).readFile(new URL("../work-store.js", import.meta.url), "utf8")) && publicPathBeforePublish === null);
  process.stdout.write(JSON.stringify({ ok: true, assertions: outcomes.length }));
} catch {
  process.stderr.write(`Local Work integration failed while ${stage}.`);
  process.exitCode = 1;
}

