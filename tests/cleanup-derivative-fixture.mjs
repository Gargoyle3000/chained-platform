import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  cleanupLocalWorkIntegrationFixture,
  sanitizeLocalWorkIntegrationDiagnostic
} from "./local-work-integration-fixture.mjs";

const retainedStateFile = fileURLToPath(new URL("./.local/retained-derivative-fixture.json", import.meta.url));
const stateFields = [
  "runId",
  "ownerProfileId",
  "delegateProfileId",
  "ownerAccountId",
  "delegateAccountId",
  "workId",
  "imageId",
  "derivativeJobId"
];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readRetainedState() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(retainedStateFile, "utf8"));
  } catch {
    throw new Error("retained_fixture_state_invalid");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.keys(parsed).length !== stateFields.length
    || !stateFields.every((field) => Object.hasOwn(parsed, field) && typeof parsed[field] === "string" && uuidPattern.test(parsed[field]))) {
    throw new Error("retained_fixture_state_invalid");
  }
  return parsed;
}

function resolveDelegationGrantId(ownerProfileId, delegateProfileId) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_CHAINED", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-q", "-t", "-A"], {
    input: `
      select id
      from public.profile_access_grants
      where grantor_profile_id = '${ownerProfileId}'::uuid
        and grantee_profile_id = '${delegateProfileId}'::uuid;
    `,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (result.status !== 0) throw new Error("retained_fixture_grant_lookup_failed");

  const grantIds = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (grantIds.length > 1 || grantIds.some((id) => !uuidPattern.test(id))) {
    throw new Error("retained_fixture_grant_lookup_ambiguous");
  }
  return grantIds[0] || null;
}

function safeFixtureOutput(state) {
  return {
    runId: state.runId,
    fixture: {
      ownerProfileId: state.ownerProfileId,
      delegateProfileId: state.delegateProfileId,
      ownerAccountId: state.ownerAccountId,
      delegateAccountId: state.delegateAccountId,
      workId: state.workId,
      imageId: state.imageId,
      derivativeJobId: state.derivativeJobId
    }
  };
}

if (!existsSync(retainedStateFile)) {
  process.stdout.write(JSON.stringify({ ok: true, status: "no_retained_fixture" }));
} else {
  try {
    const state = readRetainedState();
    const grantId = resolveDelegationGrantId(state.ownerProfileId, state.delegateProfileId);
    await cleanupLocalWorkIntegrationFixture({ ...state, grantId });
    unlinkSync(retainedStateFile);
    process.stdout.write(JSON.stringify({ ok: true, status: "retained_fixture_cleaned", ...safeFixtureOutput(state) }));
  } catch (error) {
    process.stderr.write(`Retained derivative fixture cleanup failed: ${sanitizeLocalWorkIntegrationDiagnostic(error)}.`);
    process.exitCode = 1;
  }
}
