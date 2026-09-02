import { spawnSync } from "node:child_process";

export function sanitizeCommandDiagnostic(value) {
  return String(value ?? "database command failed")
    .replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)[^\s"']+/gi, "[redacted-url]")
    .replace(/\b(?:sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9._-]+)\b/g, "[redacted-credential]")
    .replace(/\b(?:apikey|authorization|token|password)\s*[=:]\s*[^\s,;]+/gi, "$&".replace(/([=:]\s*)[^\s,;]+/, "$1[redacted]"))
    .replace(/(?:[A-Za-z0-9_-]+\/){3,}[A-Za-z0-9_.-]+/g, "[redacted-path]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240) || "database command failed";
}

export function runLinkedSql(query, run = spawnSync) {
  const command = `npx.cmd supabase db query --linked --output json "${query.replaceAll('"', '\\"')}"`;
  const child = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
  });
  if (child.status !== 0) throw new Error(`database_command_failed: ${sanitizeCommandDiagnostic(child.stderr || child.stdout)}`);
  const output = String(child.stdout ?? "");
  const jsonStart = output.indexOf("{");
  try {
    const result = JSON.parse(output.slice(jsonStart));
    if (!Array.isArray(result.rows)) throw new Error("rows_missing");
    return result.rows;
  } catch {
    throw new Error("database_command_failed: invalid database response");
  }
}

export function applyBackfillTarget(row, dimensions, sql) {
  try {
    const applied = sql(`select public.service_backfill_legacy_work_image_derivatives('${row.image_id}'::uuid,${dimensions.width},${dimensions.height}) as result`);
    if (applied.length !== 1 || applied[0]?.result?.status !== "pending") throw new Error("backfill_rpc_failed");
  } catch (error) {
    throw new Error(`backfill_apply_failed work_id=${row.work_id} image_id=${row.image_id}: ${sanitizeCommandDiagnostic(error?.message)}`);
  }
}
