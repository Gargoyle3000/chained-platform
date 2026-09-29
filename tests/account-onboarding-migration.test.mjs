import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260928120000_account_onboarding_acknowledgement.sql", import.meta.url),
  "utf8"
);

test("account onboarding migration grandfathers existing rows before setting the future-account default", () => {
  const grandfather = migration.indexOf("add column onboarding_acknowledged_version integer not null default 1;");
  const futureDefault = migration.indexOf("alter column onboarding_acknowledged_version set default 0");

  assert.ok(grandfather >= 0, "existing accounts receive version 1 when the column is added");
  assert.ok(futureDefault > grandfather, "sets default 0 only after grandfathering");
  assert.doesNotMatch(migration.slice(grandfather, futureDefault), /\bupdate\s+public\.accounts\b/i);
});
