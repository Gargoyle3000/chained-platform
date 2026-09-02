import { readFileSync } from "node:fs";
import { parseBackfillArguments } from "./backfill-legacy-derivatives-options.mjs";
import { applyBackfillTarget, runLinkedSql } from "./backfill-legacy-derivatives-sql.mjs";
import { trustedImageDimensions } from "./trusted-image-dimensions.mjs";

const api = "https://jjtobvxjmbnybbxlvnxs.supabase.co";
const fail = (message) => { throw new Error(message); };
const { apply, all, work, ids } = parseBackfillArguments(process.argv.slice(2));
const key = (readFileSync("tests/.local/production-cloud-run-smoke.env", "utf8").match(/^CHAINED_PRODUCTION_SUPABASE_SECRET_KEY=(.+)$/m) || [])[1];
if (process.env.CHAINED_PRODUCTION_SMOKE !== "1" || !key) fail("production_guard_failed");

const filter = ids.length ? `wi.id in (${ids.map((id) => `'${id}'::uuid`).join(",")})` : work ? `wi.work_id='${work}'::uuid` : "wi.deleted_at is null";
const rows = runLinkedSql(`select wi.id::text image_id,wi.work_id::text work_id,w.visibility::text visibility,wi.private_object_path,wi.pixel_width,wi.pixel_height from public.work_images wi join public.works w on w.id=wi.work_id where ${filter} and wi.deleted_at is null and w.deleted_at is null and wi.upload_status='ready' and wi.original_verified_at is not null and not exists(select 1 from private.work_image_derivative_jobs j where j.work_image_id=wi.id) and not exists(select 1 from private.work_image_derivatives d where d.work_image_id=wi.id)`);
const results = [];
for (const row of rows) {
  const path = row.private_object_path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${api}/storage/v1/object/authenticated/work-originals/${path}`, { headers: { apikey: key } });
  if (!response.ok) fail(`original_read_failed work_id=${row.work_id} image_id=${row.image_id}`);
  const dimensions = trustedImageDimensions(new Uint8Array(await response.arrayBuffer()), (response.headers.get("content-type") || "").split(";", 1)[0]);
  if (!dimensions) fail(`trusted_dimensions_unavailable work_id=${row.work_id} image_id=${row.image_id}`);
  if (apply) applyBackfillTarget(row, dimensions, runLinkedSql);
  results.push({ work_id: row.work_id, image_id: row.image_id, visibility: row.visibility, stored_dimensions: { width: row.pixel_width, height: row.pixel_height }, authoritative_dimensions: dimensions, eligible: true, action: apply ? "backfilled" : "would_backfill" });
}
console.log(JSON.stringify({ mode: apply ? "apply" : "dry_run", results }));
