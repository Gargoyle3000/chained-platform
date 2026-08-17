import {
  elevatedServiceHeaders,
  type EnvironmentReader,
  resolveSupabaseApiKeys,
  userScopedHeaders,
} from "./supabase-api-keys.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function environment(values: Record<string, string>): EnvironmentReader {
  return (name) => values[name];
}

function assertThrows(action: () => unknown, expectedMessage: string, excludedValue: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, "Expected an Error");
  assert(thrown.message.includes(expectedMessage), "Unexpected safe error message");
  assert(!thrown.message.includes(excludedValue), "Error exposed environment contents");
}

const CURRENT_PUBLISHABLE = "current-publishable-value";
const CURRENT_SECRET = "current-secret-value";
const LEGACY_ANON = "legacy-anon-value";
const LEGACY_SERVICE = "legacy-service-value";
const USER_AUTHORIZATION = "Bearer ordinary-user-session-value";

Deno.test("selects default keys from current hosted dictionaries", () => {
  const keys = resolveSupabaseApiKeys(environment({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: CURRENT_PUBLISHABLE }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: CURRENT_SECRET }),
    SUPABASE_PUBLISHABLE_KEY: "ignored-singular-publishable",
    SUPABASE_ANON_KEY: LEGACY_ANON,
    SUPABASE_SECRET_KEY: "ignored-singular-secret",
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE,
  }));

  assert(keys.publishable.value === CURRENT_PUBLISHABLE);
  assert(keys.publishable.kind === "current");
  assert(keys.secret.value === CURRENT_SECRET);
  assert(keys.secret.kind === "current");
});

Deno.test("supports singular current-key fallback when dictionaries are missing", () => {
  const keys = resolveSupabaseApiKeys(environment({
    SUPABASE_PUBLISHABLE_KEY: CURRENT_PUBLISHABLE,
    SUPABASE_SECRET_KEY: CURRENT_SECRET,
    SUPABASE_ANON_KEY: LEGACY_ANON,
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE,
  }));

  assert(keys.publishable.value === CURRENT_PUBLISHABLE);
  assert(keys.publishable.kind === "current");
  assert(keys.secret.value === CURRENT_SECRET);
  assert(keys.secret.kind === "current");
});

Deno.test("uses fallbacks when valid dictionaries do not contain the selected key", () => {
  const keys = resolveSupabaseApiKeys(environment({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ secondary: "unused-publishable" }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ secondary: "unused-secret" }),
    SUPABASE_PUBLISHABLE_KEY: CURRENT_PUBLISHABLE,
    SUPABASE_SECRET_KEY: CURRENT_SECRET,
  }));

  assert(keys.publishable.value === CURRENT_PUBLISHABLE);
  assert(keys.publishable.kind === "current");
  assert(keys.secret.value === CURRENT_SECRET);
  assert(keys.secret.kind === "current");
});

Deno.test("supports legacy key fallback when current keys are missing", () => {
  const keys = resolveSupabaseApiKeys(environment({
    SUPABASE_ANON_KEY: LEGACY_ANON,
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE,
  }));

  assert(keys.publishable.value === LEGACY_ANON);
  assert(keys.publishable.kind === "legacy");
  assert(keys.secret.value === LEGACY_SERVICE);
  assert(keys.secret.kind === "legacy");
});

Deno.test("rejects malformed hosted key dictionaries without exposing their contents", () => {
  const malformedPublishable = `{\"default\":\"${CURRENT_PUBLISHABLE}`;
  assertThrows(
    () => resolveSupabaseApiKeys(environment({
      SUPABASE_PUBLISHABLE_KEYS: malformedPublishable,
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: CURRENT_SECRET }),
      SUPABASE_ANON_KEY: LEGACY_ANON,
    })),
    "SUPABASE_PUBLISHABLE_KEYS is invalid",
    CURRENT_PUBLISHABLE,
  );

  const malformedSecret = `{\"default\":\"${CURRENT_SECRET}`;
  assertThrows(
    () => resolveSupabaseApiKeys(environment({
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: CURRENT_PUBLISHABLE }),
      SUPABASE_SECRET_KEYS: malformedSecret,
      SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE,
    })),
    "SUPABASE_SECRET_KEYS is invalid",
    CURRENT_SECRET,
  );
});

Deno.test("rejects missing key configuration with a sanitized error", () => {
  assertThrows(
    () => resolveSupabaseApiKeys(environment({})),
    "configuration is incomplete",
    CURRENT_SECRET,
  );
});

Deno.test("current secret headers use apikey only", () => {
  const keys = resolveSupabaseApiKeys(environment({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: CURRENT_PUBLISHABLE }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: CURRENT_SECRET }),
  }));
  const headers = elevatedServiceHeaders(keys.secret, {
    authorization: "Bearer value-that-must-be-removed",
    "content-type": "application/json",
  });

  assert(headers.get("apikey") === CURRENT_SECRET);
  assert(headers.get("authorization") === null);
  assert(headers.get("content-type") === "application/json");
});

Deno.test("legacy service headers retain legacy Bearer compatibility", () => {
  const keys = resolveSupabaseApiKeys(environment({
    SUPABASE_ANON_KEY: LEGACY_ANON,
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE,
  }));
  const headers = elevatedServiceHeaders(keys.secret);

  assert(headers.get("apikey") === LEGACY_SERVICE);
  assert(headers.get("authorization") === `Bearer ${LEGACY_SERVICE}`);
});

Deno.test("user-scoped headers preserve the user JWT with a publishable key", () => {
  const keys = resolveSupabaseApiKeys(environment({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: CURRENT_PUBLISHABLE }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: CURRENT_SECRET }),
  }));
  const headers = userScopedHeaders(keys.publishable, USER_AUTHORIZATION);

  assert(headers.get("apikey") === CURRENT_PUBLISHABLE);
  assert(headers.get("authorization") === USER_AUTHORIZATION);
  assert(headers.get("authorization") !== `Bearer ${CURRENT_SECRET}`);
});

Deno.test("key resolution and header construction do not log credentials", () => {
  const entries: unknown[][] = [];
  const originals = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };
  const capture = (...entry: unknown[]) => entries.push(entry);
  console.debug = capture;
  console.error = capture;
  console.info = capture;
  console.log = capture;
  console.warn = capture;

  try {
    const keys = resolveSupabaseApiKeys(environment({
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: CURRENT_PUBLISHABLE }),
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: CURRENT_SECRET }),
    }));
    userScopedHeaders(keys.publishable, USER_AUTHORIZATION);
    elevatedServiceHeaders(keys.secret);
  } finally {
    console.debug = originals.debug;
    console.error = originals.error;
    console.info = originals.info;
    console.log = originals.log;
    console.warn = originals.warn;
  }

  assert(entries.length === 0);
});
