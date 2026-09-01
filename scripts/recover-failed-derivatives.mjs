import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { trustedImageDimensions } from "../supabase/functions/_shared/work-media.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const API = "https://jjtobvxjmbnybbxlvnxs.supabase.co";
const ENV_FILE = new URL("../tests/.local/production-cloud-run-smoke.env", import.meta.url);
const fail = (code) => { throw new Error(code); };
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

export function parseArguments(argv) {
  const value = { apply: false, workId: "", imageIds: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--apply") value.apply = true;
    else if (argv[i] === "--work-id") value.workId = argv[++i] ?? "";
    else if (argv[i] === "--image-id") value.imageIds.push(argv[++i] ?? "");
    else fail("invalid_arguments");
  }
  if (!UUID.test(value.workId) || !value.imageIds.length || value.imageIds.some((id) => !UUID.test(id)) || new Set(value.imageIds).size !== value.imageIds.length) fail("invalid_arguments");
  return value;
}

function configuration() {
  if (process.env.CHAINED_PRODUCTION_SMOKE !== "1" || !existsSync(ENV_FILE)) fail("production_guard_failed");
  const line = readFileSync(ENV_FILE, "utf8").match(/^CHAINED_PRODUCTION_SUPABASE_SECRET_KEY=(.+)$/m);
  if (!line) fail("production_credentials_unavailable");
  return { api: API, key: line[1] };
}
function sql(query) {
  const result = spawnSync("npx.cmd", ["supabase", "db", "query", "--linked", "--output", "json", "--query", query], { encoding: "utf8", env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" } });
  if (result.status !== 0) fail("database_read_failed");
  try { return JSON.parse(result.stdout); } catch { fail("database_response_invalid"); }
}
function targetRow(workId, imageId) {
  const rows = sql(`select wi.id::text as image_id, wi.private_object_path, wi.pixel_width, wi.pixel_height, wi.upload_status::text, wi.original_verified_at is not null as original_verified, w.visibility::text as work_visibility, j.id::text as job_id, j.state::text as job_state, j.source_private_object_path=wi.private_object_path as current_source, jsonb_agg(jsonb_build_object('key',d.rendition_key,'state',d.state,'path',d.staging_object_path) order by d.rendition_key) as derivatives from public.work_images wi join public.works w on w.id=wi.work_id join private.work_image_derivative_jobs j on j.work_image_id=wi.id and j.source_private_object_path=wi.private_object_path join private.work_image_derivatives d on d.work_image_id=wi.id and d.source_private_object_path=wi.private_object_path where wi.id='${imageId}'::uuid and wi.work_id='${workId}'::uuid group by wi.id,w.id,j.id`);
  const row = rows[0];
  if (!row || rows.length !== 1 || row.upload_status !== "ready" || !row.original_verified || row.work_visibility !== "draft" || !row.current_source || row.job_state !== "failed" || row.derivatives?.length !== 2 || row.derivatives.some((d) => d.state === "ready" || !["small","large"].includes(d.key))) fail("target_not_recoverable");
  return row;
}
async function run(options, deps) {
  const output=[];
  for (const imageId of options.imageIds) {
    const row=deps.targetRow(options.workId,imageId); const original=await deps.original(row.private_object_path); const dimensions=trustedImageDimensions(original.bytes,original.mimeType);
    if (!dimensions) fail("trusted_dimensions_unavailable"); const paths=row.derivatives.map((d)=>d.path);
    if (options.apply) { await deps.remove(paths); await deps.requeue(imageId,dimensions); }
    output.push({image_id:imageId,job_id:row.job_id,stored_dimensions:{width:Number(row.pixel_width),height:Number(row.pixel_height)},authoritative_dimensions:dimensions,job_state:"failed",staging_outputs:2,actions:options.apply?["staging_cleanup","requeue"]:["would_cleanup_staging","would_requeue"]});
  } return output;
}
export { run };
async function main() {
  const options=parseArguments(process.argv.slice(2)); const config=configuration(); const headers={apikey:config.key};
  const get=async (path) => { const r=await fetch(`${config.api}/storage/v1/object/authenticated/work-originals/${encodePath(path)}`,{headers}); if(!r.ok) fail("original_read_failed"); return {bytes:new Uint8Array(await r.arrayBuffer()),mimeType:(r.headers.get("content-type")||"").split(";",1)[0]}; };
  const remove=async (paths) => { const r=await fetch(`${config.api}/storage/v1/object/work-derivative-staging`,{method:"DELETE",headers:{...headers,"content-type":"application/json"},body:JSON.stringify({prefixes:paths})}); if(!r.ok) fail("staging_cleanup_failed"); for(const path of paths){const check=await fetch(`${config.api}/storage/v1/object/authenticated/work-derivative-staging/${encodePath(path)}`,{headers});if(check.status!==404)fail("staging_cleanup_incomplete");} };
  const requeue=async (imageId,dimensions) => { const r=await fetch(`${config.api}/rest/v1/rpc/service_requeue_failed_work_image_derivatives`,{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify({target_image_id:imageId,authoritative_width:dimensions.width,authoritative_height:dimensions.height})}); if(!r.ok)fail("recovery_rpc_failed"); const v=await r.json();if(v?.status!=="pending")fail("recovery_rpc_invalid"); };
  console.log(JSON.stringify({mode:options.apply?"apply":"dry_run",results:await run(options,{targetRow,original:get,remove,requeue})}));
}
if(process.argv[1]===fileURLToPath(import.meta.url)) main().catch((error)=>{console.error(`Derivative recovery failed: ${error.message}`);process.exitCode=1;});
