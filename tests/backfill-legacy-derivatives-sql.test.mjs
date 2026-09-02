import assert from "node:assert/strict";
import test from "node:test";
import { applyBackfillTarget, runLinkedSql } from "../scripts/backfill-legacy-derivatives-sql.mjs";

const target = { work_id: "b3000000-0000-4000-8000-000000000001", image_id: "b4000000-0000-4000-8000-000000000001" };

test("linked SQL failure remains failed with sanitized diagnostics", () => {
  const secret = "sb_secret_not-for-output";
  let error;
  try { runLinkedSql("select 1", () => ({ status: 1, stdout: "", stderr: `ERROR: ${secret} postgres://user:password@example.test/db profiles/a/b/c/original.jpg` })); } catch (caught) { error = caught; }
  assert.ok(error instanceof Error);
  assert.match(error.message, /database_command_failed/);
  assert.doesNotMatch(error.message, new RegExp(secret));
  assert.doesNotMatch(error.message, /postgres:\/\//);
  assert.doesNotMatch(error.message, /original\.jpg/);
});

test("failed target reports only its safe IDs and stops later targets from succeeding", () => {
  const attempted = [];
  const sql = () => { attempted.push(target.image_id); throw new Error("database_command_failed: ERROR: SQLSTATE 55000"); };
  let error;
  try { applyBackfillTarget(target, { width: 1, height: 1 }, sql); } catch (caught) { error = caught; }
  assert.ok(error instanceof Error);
  assert.match(error.message, new RegExp(`work_id=${target.work_id}`));
  assert.match(error.message, new RegExp(`image_id=${target.image_id}`));
  assert.deepEqual(attempted, [target.image_id]);
});
