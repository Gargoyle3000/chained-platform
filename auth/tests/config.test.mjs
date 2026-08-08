import test from "node:test";
import assert from "node:assert/strict";

import {
  FRONTEND_MODES,
  FRONTEND_TARGETS,
  LOCAL_CALLBACK_URL,
  PRODUCTION_CALLBACK_URL,
  PRODUCTION_SUPABASE_URL,
  isBrowserSafeSupabaseKey,
  loadFrontendConfig,
  resolveFrontendTarget,
  validateFrontendConfig
} from "../config.mjs";

function fakeJwt(role) {
  const header = Buffer
    .from(JSON.stringify({ alg: "none" }))
    .toString("base64url");

  const payload = Buffer
    .from(JSON.stringify({ role }))
    .toString("base64url");

  return `${header}.${payload}.not-a-signature`;
}

test("localhost resolves to the local frontend target", () => {
  assert.equal(
    resolveFrontendTarget({ hostname: "127.0.0.1" }),
    FRONTEND_TARGETS.LOCAL
  );

  assert.equal(
    resolveFrontendTarget({ hostname: "localhost" }),
    FRONTEND_TARGETS.LOCAL
  );
});

test("chained.work resolves to the production frontend target", () => {
  assert.equal(
    resolveFrontendTarget({ hostname: "chained.work" }),
    FRONTEND_TARGETS.PRODUCTION
  );
});

test("unknown hosts remain prototype-only", () => {
  assert.equal(
    resolveFrontendTarget({ hostname: "example.test" }),
    null
  );
});

test("missing local configuration falls back to prototype mode", async () => {
  const config = await loadFrontendConfig({
    location: { hostname: "127.0.0.1" },
    probe: async () => ({ ok: false, status: 404 })
  });

  assert.equal(config.mode, FRONTEND_MODES.PROTOTYPE);
});

test("missing production configuration fails closed", async () => {
  await assert.rejects(
    () => loadFrontendConfig({
      location: { hostname: "chained.work" },
      probe: async () => ({ ok: false, status: 404 })
    }),
    /Production frontend configuration is unavailable/
  );
});

test("unknown host does not load Supabase configuration", async () => {
  let probed = false;

  const config = await loadFrontendConfig({
    location: { hostname: "example.test" },
    probe: async () => {
      probed = true;
      return { ok: true, status: 200 };
    }
  });

  assert.equal(config.mode, FRONTEND_MODES.PROTOTYPE);
  assert.equal(probed, false);
});

test("valid local Supabase configuration is accepted", () => {
  const config = validateFrontendConfig({
    mode: FRONTEND_MODES.SUPABASE,
    target: FRONTEND_TARGETS.LOCAL,
    supabaseUrl: "http://127.0.0.1:54321",
    supabaseKey: "sb_publishable_local-browser-value",
    callbackUrl: LOCAL_CALLBACK_URL
  });

  assert.equal(config.mode, FRONTEND_MODES.SUPABASE);
  assert.equal(config.target, FRONTEND_TARGETS.LOCAL);
  assert.equal(config.supabaseUrl, "http://127.0.0.1:54321");
});

test("valid production Supabase configuration is accepted", () => {
  const config = validateFrontendConfig({
    mode: FRONTEND_MODES.SUPABASE,
    target: FRONTEND_TARGETS.PRODUCTION,
    supabaseUrl: PRODUCTION_SUPABASE_URL,
    supabaseKey: "sb_publishable_production-browser-value",
    callbackUrl: PRODUCTION_CALLBACK_URL
  });

  assert.equal(config.mode, FRONTEND_MODES.SUPABASE);
  assert.equal(config.target, FRONTEND_TARGETS.PRODUCTION);
  assert.equal(config.supabaseUrl, PRODUCTION_SUPABASE_URL);
  assert.equal(config.callbackUrl, PRODUCTION_CALLBACK_URL);
});

test("production host selects production configuration", async () => {
  let selectedUrl = "";

  const config = await loadFrontendConfig({
    location: { hostname: "chained.work" },

    probe: async (url) => {
      selectedUrl = url.href;
      return { ok: true, status: 200 };
    },

    importer: async () => ({
      default: {
        mode: FRONTEND_MODES.SUPABASE,
        target: FRONTEND_TARGETS.PRODUCTION,
        supabaseUrl: PRODUCTION_SUPABASE_URL,
        supabaseKey: "sb_publishable_production-browser-value",
        callbackUrl: PRODUCTION_CALLBACK_URL
      }
    })
  });

  assert.match(
    selectedUrl,
    /frontend-config\.production\.mjs$/
  );

  assert.equal(
    config.target,
    FRONTEND_TARGETS.PRODUCTION
  );
});

test("production configuration cannot point to another Supabase project", () => {
  assert.throws(() => validateFrontendConfig({
    mode: FRONTEND_MODES.SUPABASE,
    target: FRONTEND_TARGETS.PRODUCTION,
    supabaseUrl: "https://different-project.supabase.co",
    supabaseKey: "sb_publishable_production-browser-value",
    callbackUrl: PRODUCTION_CALLBACK_URL
  }));
});

test("local configuration cannot point to a hosted API", () => {
  assert.throws(() => validateFrontendConfig({
    mode: FRONTEND_MODES.SUPABASE,
    target: FRONTEND_TARGETS.LOCAL,
    supabaseUrl: PRODUCTION_SUPABASE_URL,
    supabaseKey: "sb_publishable_local-browser-value",
    callbackUrl: LOCAL_CALLBACK_URL
  }));
});

test("production configuration cannot use the local callback", () => {
  assert.throws(() => validateFrontendConfig({
    mode: FRONTEND_MODES.SUPABASE,
    target: FRONTEND_TARGETS.PRODUCTION,
    supabaseUrl: PRODUCTION_SUPABASE_URL,
    supabaseKey: "sb_publishable_production-browser-value",
    callbackUrl: LOCAL_CALLBACK_URL
  }));
});

test("legacy anon JWT is accepted as browser-safe", () => {
  assert.equal(
    isBrowserSafeSupabaseKey(fakeJwt("anon")),
    true
  );
});

test("secret key format is rejected", () => {
  assert.equal(
    isBrowserSafeSupabaseKey("sb_" + "secret_not-for-a-browser"),
    false
  );
});

test("service-role JWT is rejected", () => {
  assert.equal(
    isBrowserSafeSupabaseKey(fakeJwt("service_role")),
    false
  );
});