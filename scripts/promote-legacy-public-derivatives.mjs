import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parseLegacyPromotionArguments, requirePromotionProductionGuard } from "./promote-legacy-public-derivatives-options.mjs";
import { runLinkedSql } from "./backfill-legacy-derivatives-sql.mjs";

const API = "https://jjtobvxjmbnybbxlvnxs.supabase.co";
const fail = (message) => { throw new Error(message); };
const text = (value) => typeof value === "string" ? value.trim() : "";
const encodePath = (path) => text(path).split("/").map(encodeURIComponent).join("/");

function webpDimensions(bytes) {
  if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") return null;
  const tag = String.fromCharCode(...bytes.slice(12, 16));
  const le16 = (index) => bytes[index] | (bytes[index + 1] << 8);
  if (tag === "VP8X") return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
  if (tag === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
  if (tag === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) { const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
  return null;
}

export function verifyDerivativeBytes(bytes, mimeType, expected) {
  const dimensions = webpDimensions(bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return Boolean(
    text(mimeType).toLowerCase() === "image/webp"
    && bytes.byteLength === Number(expected?.file_size)
    && dimensions?.width === Number(expected?.pixel_width)
    && dimensions?.height === Number(expected?.pixel_height)
    && checksum === text(expected?.checksum_sha256)
  );
}

function targetRows(options) {
  const filter = options.workId ? `wi.work_id='${options.workId}'::uuid` : `wi.id in (${options.imageIds.map((id) => `'${id}'::uuid`).join(",")})`;
  return runLinkedSql(`select w.title,wi.work_id::text work_id,wi.id::text image_id,w.publication_revision::text publication_revision,case when wi.public_object_path ~* '[.]jpe?g$' then 'legacy_jpg' else 'legacy_noncanonical' end current_public_state,wi.original_verified_at is not null original_verified,wi.public_object_path=lower(w.owner_profile_id::text)||'/'||lower(w.id::text)||'/'||lower(w.publication_revision::text)||'/'||lower(wi.id::text)||'/small.webp' canonical_small_pointer,exists(select 1 from private.work_image_derivatives d where d.work_image_id=wi.id and d.source_private_object_path=wi.private_object_path and d.rendition_key='small' and d.state='ready' and d.mime_type='image/webp') small_ready,exists(select 1 from private.work_image_derivatives d join storage.objects o on o.bucket_id='work-derivative-staging' and o.name=d.staging_object_path where d.work_image_id=wi.id and d.source_private_object_path=wi.private_object_path and d.rendition_key='small' and d.state='ready' and d.mime_type='image/webp') small_staged,exists(select 1 from private.work_image_derivatives d where d.work_image_id=wi.id and d.source_private_object_path=wi.private_object_path and d.rendition_key='large' and d.state='ready' and d.mime_type='image/webp') large_ready,exists(select 1 from private.work_image_derivatives d join storage.objects o on o.bucket_id='work-derivative-staging' and o.name=d.staging_object_path where d.work_image_id=wi.id and d.source_private_object_path=wi.private_object_path and d.rendition_key='large' and d.state='ready' and d.mime_type='image/webp') large_staged,exists(select 1 from public.work_publication_derivatives pd where pd.work_image_id=wi.id and pd.publication_revision=w.publication_revision and pd.rendition_key='small' and pd.copy_status='created') already_small,exists(select 1 from public.work_publication_derivatives pd where pd.work_image_id=wi.id and pd.publication_revision=w.publication_revision and pd.rendition_key='large' and pd.copy_status='created') already_large,exists(select 1 from public.work_publication_operations op where op.work_id=w.id and op.operation_kind='publish' and op.status='succeeded' and op.publication_revision=w.publication_revision) historic_publish,not exists(select 1 from public.work_publication_operations op where op.work_id=w.id and op.status in ('pending','running','cleanup_pending')) no_active_operation from public.work_images wi join public.works w on w.id=wi.work_id where ${filter} and wi.deleted_at is null and w.deleted_at is null and w.visibility='published' order by wi.sort_order,wi.id`);
}

export function safePromotionSummary(row) {
  const prerequisites = row.original_verified === true && row.small_ready === true && row.small_staged === true && row.large_ready === true && row.large_staged === true && row.historic_publish === true && row.no_active_operation === true && Boolean(text(row.publication_revision));
  const alreadyPromoted = row.canonical_small_pointer === true && row.already_small === true && row.already_large === true;
  const eligible = prerequisites && row.canonical_small_pointer !== true && row.already_small !== true && row.already_large !== true;
  return Object.freeze({ title: text(row.title), work_id: text(row.work_id), image_id: text(row.image_id), current_public_state: text(row.current_public_state), original_verified: row.original_verified === true, small_ready: row.small_ready === true, small_staged: row.small_staged === true, large_ready: row.large_ready === true, large_staged: row.large_staged === true, publication_revision_valid: Boolean(text(row.publication_revision)), historic_publication_valid: row.historic_publish === true, no_active_operation: row.no_active_operation === true, expected_public_paths: "<profile>/<work>/<revision>/<image>/small.webp + large.webp", state: alreadyPromoted ? "already_promoted" : (eligible ? "needs_promotion" : "blocked"), blocker: alreadyPromoted || eligible ? null : "legacy_promotion_prerequisite_unavailable" });
}

async function rpc(key, name, body) {
  const response = await fetch(`${API}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) fail(`promotion_rpc_failed:${name}`);
  return await response.json();
}

async function download(key, bucket, path) {
  const response = await fetch(`${API}/storage/v1/object/authenticated/${bucket}/${encodePath(path)}`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  if (!response.ok) fail("promotion_object_download_failed");
  return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: (response.headers.get("content-type") || "").split(";", 1)[0] };
}

async function ensurePublicCopy(key, source, target) {
  const sourceObject = await download(key, "work-derivative-staging", source.staging_object_path);
  if (!verifyDerivativeBytes(sourceObject.bytes, sourceObject.mimeType, source)) fail("promotion_staging_verification_failed");
  const upload = await fetch(`${API}/storage/v1/object/work-public/${encodePath(target.public_object_path)}`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "image/webp", "x-upsert": "false" }, body: sourceObject.bytes });
  if (!upload.ok && upload.status !== 409) fail("promotion_public_copy_failed");
  const publicObject = await download(key, "work-public", target.public_object_path);
  if (!verifyDerivativeBytes(publicObject.bytes, publicObject.mimeType, target)) fail("promotion_public_verification_failed");
}

async function promoteRow(row, key) {
  const plan = await rpc(key, "service_legacy_public_derivative_promotion_plan", { target_work_id: row.work_id, target_image_id: row.image_id, expected_publication_revision: row.publication_revision });
  if (plan?.status === "already_promoted") return "already_promoted";
  if (plan?.status !== "ready_to_promote") fail("promotion_plan_invalid");
  await ensurePublicCopy(key, plan.small, plan.small);
  await ensurePublicCopy(key, plan.large, plan.large);
  const result = await rpc(key, "service_finalize_legacy_public_derivative_promotion", { target_work_id: row.work_id, target_image_id: row.image_id, expected_publication_revision: row.publication_revision });
  if (result?.status !== "promoted" && result?.status !== "already_promoted") fail("promotion_finalize_invalid");
  return result.status;
}

export async function runLegacyPublicDerivativePromotion(options, environment = process.env) {
  const rows = targetRows(options);
  if (!rows.length) fail("no_published_targets");
  const results = rows.map(safePromotionSummary);
  if (!options.apply) return Object.freeze({ mode: "dry_run", results });
  requirePromotionProductionGuard(options, environment);
  if (results.some((result) => result.state === "blocked")) fail("promotion_preflight_blocked");
  const key = text(environment.CHAINED_PRODUCTION_SUPABASE_SECRET_KEY);
  for (let index = 0; index < rows.length; index += 1) results[index] = Object.freeze({ ...results[index], action: await promoteRow(rows[index], key) });
  return Object.freeze({ mode: "apply", results });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseLegacyPromotionArguments(process.argv.slice(2));
  console.log(JSON.stringify(await runLegacyPublicDerivativePromotion(options)));
}
