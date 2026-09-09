import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("CV import Edge Function is explicitly JWT-protected, beta-gated, and server-secret only", async () => {
  const [config, index, logic, provider, browser] = await Promise.all([
    readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/cv-import-extract/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/cv-import-extract/logic.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/cv-import-extract/provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../data/cv-import-extraction.mjs", import.meta.url), "utf8")
  ]);

  assert.match(config, /\[functions\.cv-import-extract\][\s\S]*?verify_jwt = true/);
  assert.match(index, /requiredEnvironment\("OPENAI_API_KEY"\)/);
  assert.match(index, /configuredUuidSet\("CV_IMPORT_BETA_USER_IDS"\)/);
  assert.match(index, /\/auth\/v1\/user/);
  assert.match(index, /accounts[\s\S]*status/);
  assert.match(logic, /betaUserIds\.has\(caller\.id\)/);
  assert.doesNotMatch(browser, /OPENAI_API_KEY|api\.openai\.com|authorization:\s*`Bearer/);
  assert.doesNotMatch(`${index}\n${logic}`, /storage\/v1|\.insert\(|\.upsert\(|method:\s*["'](?:PUT|PATCH|DELETE)/);
  assert.match(provider, /store:\s*false/);
  assert.doesNotMatch(provider, /\/v1\/files|retry/i);
  for (const phase of [
    "provider_request_construction",
    "provider_fetch_started",
    "provider_fetch_failed",
    "provider_http_error",
    "provider_response_received",
    "provider_response_parse",
    "provider_response_validation",
    "chained_schema_validation",
    "provider_completed"
  ]) {
    assert.match(provider, new RegExp(phase));
  }
  assert.match(index, /event:\s*"cv_import_provider"/);
  assert.doesNotMatch(provider, /error\.message|error\.stack|console\.(?:log|info|error)/);
});
