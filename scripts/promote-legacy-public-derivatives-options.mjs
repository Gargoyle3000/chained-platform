const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseLegacyPromotionArguments(args = []) {
  const apply = args.includes("--apply");
  const workIndex = args.indexOf("--work-id");
  const workId = workIndex < 0 ? "" : args[workIndex + 1] || "";
  const imageIds = args.filter((value, index) => args[index - 1] === "--image-id");
  if ((!workId && imageIds.length === 0) || (workId && imageIds.length) || !imageIds.every((id) => uuid.test(id)) || (workId && !uuid.test(workId))) {
    throw new Error("explicit_target_required");
  }
  return Object.freeze({ apply, workId, imageIds: Object.freeze(imageIds) });
}

export function requirePromotionProductionGuard(options, environment = process.env) {
  if (!options?.apply) return;
  if (environment.CHAINED_PRODUCTION_LEGACY_PROMOTION !== "1") throw new Error("production_guard_failed");
  if (!String(environment.CHAINED_PRODUCTION_SUPABASE_SECRET_KEY || "").trim()) throw new Error("production_secret_unavailable");
}
