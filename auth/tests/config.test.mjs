import test from "node:test";
import assert from "node:assert/strict";

import {
  FRONTEND_MODES,
  LOCAL_CALLBACK_URL,
  isBrowserSafeSupabaseKey,
  loadFrontendConfig,
  validateFrontendConfig
} from "../config.mjs";

function fakeJwt(role) {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.not-a-signature`;
}

test("missing local configuration falls back to prototype mode", async () => {
  const config = await loadFrontendConfig({
    probe: async () => ({ ok: false, status: 404 })
  });
  assert.equal(config.mode, FRONTEND_MODES.PROTOTYPE);
});

test("valid local-supabase configuration is accepted", () => {
  const config = validateFrontendConfig({
    mode: FRONTEND_MODES.LOCAL_SUPABASE,
    supabaseUrl: "http://127.0.0.1:54321",
    supabaseKey: "sb_publishable_local-browser-value",
    callbackUrl: LOCAL_CALLBACK_URL
  });
  assert.equal(config.mode, FRONTEND_MODES.LOCAL_SUPABASE);
  assert.equal(config.supabaseUrl, "http://127.0.0.1:54321");
});

test("legacy anon JWT is accepted as browser-safe", () => {
  assert.equal(isBrowserSafeSupabaseKey(fakeJwt("anon")), true);
});

test("secret key format is rejected", () => {
  assert.equal(
    isBrowserSafeSupabaseKey("sb_" + "secret_not-for-a-browser"),
    false
  );
});

test("service-role JWT is rejected", () => {
  assert.equal(isBrowserSafeSupabaseKey(fakeJwt("service_role")), false);
});

test("non-local API URL is rejected", () => {
  assert.throws(() => validateFrontendConfig({
    mode: FRONTEND_MODES.LOCAL_SUPABASE,
    supabaseUrl: "https://project.example.test",
    supabaseKey: "sb_publishable_local-browser-value",
    callbackUrl: LOCAL_CALLBACK_URL
  }));
});

