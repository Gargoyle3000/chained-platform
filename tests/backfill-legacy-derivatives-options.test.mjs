import assert from "node:assert/strict";
import test from "node:test";
import { parseBackfillArguments } from "../scripts/backfill-legacy-derivatives-options.mjs";

const workId = "b3000000-0000-4000-8000-000000000001";
const imageId = "b4000000-0000-4000-8000-000000000001";

test("legacy backfill command requires one explicit target mode", () => {
  assert.throws(() => parseBackfillArguments([]), /explicit_target_required/);
  assert.throws(() => parseBackfillArguments(["--all", "--work-id", workId]), /explicit_target_required/);
  assert.throws(() => parseBackfillArguments(["--image-id", "not-a-uuid"]), /explicit_target_required/);
});

test("legacy backfill command supports dry-run and apply target modes", () => {
  assert.deepEqual(parseBackfillArguments(["--work-id", workId]), { apply: false, all: false, work: workId, ids: [] });
  assert.deepEqual(parseBackfillArguments(["--image-id", imageId, "--apply"]), { apply: true, all: false, work: "", ids: [imageId] });
  assert.deepEqual(parseBackfillArguments(["--all"]), { apply: false, all: true, work: "", ids: [] });
});
