const uuid = /^[0-9a-f-]{36}$/i;

export function parseBackfillArguments(args) {
  const apply = args.includes("--apply");
  const all = args.includes("--all");
  const workIndex = args.indexOf("--work-id");
  const work = workIndex < 0 ? "" : args[workIndex + 1] || "";
  const ids = args.filter((value, index) => args[index - 1] === "--image-id");

  if ((work && !uuid.test(work)) || ids.some((id) => !uuid.test(id)) || ((work || ids.length) && all) || (!all && !work && !ids.length)) {
    throw new Error("explicit_target_required");
  }

  return { apply, all, work, ids };
}
