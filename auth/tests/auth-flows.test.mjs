import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  authenticateWithPassword,
  establishPasswordLinkSession,
  requestMagicLink,
  requestPasswordRecovery,
  updateSameUserPassword
} from "../auth-flows.mjs";
import { readAuthLinkInput } from "../auth-logic.mjs";

function authClient(overrides = {}) {
  return {
    auth: {
      signInWithPassword: async () => ({
        data: { user: { id: "auth-user" } },
        error: null
      }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      exchangeCodeForSession: async () => ({ data: {}, error: null }),
      updateUser: async () => ({
        data: { user: { id: "auth-user" } },
        error: null
      }),
      signOut: async () => ({ error: null }),
      ...overrides
    }
  };
}

const activeSession = async () => ({
  kind: "active",
  user: { id: "auth-user" },
  account: { status: "active" }
});

test("password login validates the same active CHAINED account", async () => {
  let credentials;
  let signedOut = 0;
  const client = authClient({
    signInWithPassword: async (value) => {
      credentials = value;
      return { data: { user: { id: "auth-user" } }, error: null };
    },
    signOut: async () => { signedOut += 1; }
  });

  const result = await authenticateWithPassword(
    client,
    { email: "member@example.test", password: "not-recorded" },
    activeSession
  );

  assert.deepEqual(credentials, {
    email: "member@example.test",
    password: "not-recorded"
  });
  assert.equal(result.kind, "active");
  assert.equal(result.userId, "auth-user");
  assert.equal(signedOut, 0);
});

test("wrong and unknown password credentials use one generic result", async () => {
  let signedOut = 0;
  let thrownSignedOut = 0;
  const errorClient = authClient({
    signInWithPassword: async () => ({ data: {}, error: new Error("invalid") }),
    signOut: async () => { signedOut += 1; }
  });
  const thrownClient = authClient({
    signInWithPassword: async () => { throw new Error("network"); },
    signOut: async () => { thrownSignedOut += 1; }
  });

  const wrong = await authenticateWithPassword(
    errorClient,
    { email: "known@example.test", password: "wrong" },
    activeSession
  );
  const unknown = await authenticateWithPassword(
    thrownClient,
    { email: "unknown@example.test", password: "wrong" },
    activeSession
  );

  assert.equal(wrong.message, unknown.message);
  assert.equal(wrong.message.includes("known"), false);
  assert.equal(signedOut, 0);
  assert.equal(thrownSignedOut, 0);
});

test("invalid application validation signs out the established session", async () => {
  let signedOut = 0;
  const result = await authenticateWithPassword(
    authClient({ signOut: async () => { signedOut += 1; } }),
    { email: "member@example.test", password: "not-recorded" },
    async () => ({ kind: "invalid" })
  );

  assert.equal(result.kind, "denied");
  assert.equal(signedOut, 1);
});

test("thrown application validation signs out the established session", async () => {
  let signedOut = 0;
  const result = await authenticateWithPassword(
    authClient({ signOut: async () => { signedOut += 1; } }),
    { email: "member@example.test", password: "not-recorded" },
    async () => { throw new Error("validation unavailable"); }
  );

  assert.equal(result.kind, "unavailable");
  assert.equal(signedOut, 1);
});

for (const reason of ["suspended", "disabled", "missing"]) {
  test(`${reason} CHAINED account is signed out and denied`, async () => {
    let signedOut = 0;
    const client = authClient({
      signOut: async () => { signedOut += 1; }
    });
    const result = await authenticateWithPassword(
      client,
      { email: "member@example.test", password: "not-recorded" },
      async () => ({ kind: "denied", reason })
    );

    assert.equal(result.kind, "denied");
    assert.equal(signedOut, 1);
  });
}

test("magic-link fallback remains invitation-only", async () => {
  let request;
  const client = authClient({
    signInWithOtp: async (value) => {
      request = value;
      return { data: {}, error: null };
    }
  });

  const result = await requestMagicLink(client, {
    email: "member@example.test",
    callbackUrl: "https://chained.work/auth-callback.html"
  });

  assert.equal(request.options.shouldCreateUser, false);
  assert.equal(
    request.options.emailRedirectTo,
    "https://chained.work/auth-callback.html"
  );
  assert.equal(result.kind, "generic-success");
});

test("password recovery uses the exact password-update redirect", async () => {
  let request;
  const client = authClient({
    resetPasswordForEmail: async (email, options) => {
      request = { email, options };
      return { data: {}, error: null };
    }
  });

  const result = await requestPasswordRecovery(client, {
    email: "member@example.test",
    passwordUpdateUrl: "https://chained.work/password-update.html"
  });

  assert.deepEqual(request, {
    email: "member@example.test",
    options: { redirectTo: "https://chained.work/password-update.html" }
  });
  assert.equal(result.kind, "generic-success");
});

test("password recovery response is generic when Auth rejects the request", async () => {
  const result = await requestPasswordRecovery(
    authClient({ resetPasswordForEmail: async () => { throw new Error("missing"); } }),
    {
      email: "unknown@example.test",
      passwordUpdateUrl: "https://chained.work/password-update.html"
    }
  );

  assert.equal(result.kind, "generic-success");
  assert.equal(result.message.includes("unknown"), false);
});

test("password link exchanges once and requires an active application account", async () => {
  let exchanged;
  const client = authClient({
    exchangeCodeForSession: async (code) => {
      exchanged = code;
      return { data: {}, error: null };
    }
  });
  const result = await establishPasswordLinkSession(
    client,
    { code: "single-use-code", hasAuthParameters: true },
    activeSession
  );

  assert.equal(exchanged, "single-use-code");
  assert.equal(result.kind, "active");
  assert.equal(result.userId, "auth-user");
});

test("expired or reused password-link code fails before application validation", async () => {
  let validated = 0;
  let signedOut = 0;
  const result = await establishPasswordLinkSession(
    authClient({
      exchangeCodeForSession: async () => ({
        data: {},
        error: new Error("expired")
      }),
      signOut: async () => { signedOut += 1; }
    }),
    { code: "expired-code", hasAuthParameters: true },
    async () => { validated += 1; return { kind: "active" }; }
  );

  assert.equal(result.kind, "invalid");
  assert.equal(validated, 0);
  assert.equal(signedOut, 0);
});

test("thrown password-link exchange fails without disturbing another session", async () => {
  let validated = 0;
  let signedOut = 0;
  const result = await establishPasswordLinkSession(
    authClient({
      exchangeCodeForSession: async () => { throw new Error("exchange failed"); },
      signOut: async () => { signedOut += 1; }
    }),
    { code: "invalid-code", hasAuthParameters: true },
    async () => { validated += 1; return { kind: "active" }; }
  );

  assert.equal(result.kind, "invalid");
  assert.equal(validated, 0);
  assert.equal(signedOut, 0);
});

test("implicit fragment-token password link reaches active account validation", async () => {
  let exchanged = 0;
  const linkInput = readAuthLinkInput(
    "",
    "#access_token=private-access&refresh_token=private-refresh&type=recovery"
  );
  const result = await establishPasswordLinkSession(
    authClient({
      exchangeCodeForSession: async () => { exchanged += 1; }
    }),
    linkInput,
    activeSession
  );

  assert.equal(linkInput.hasAuthParameters, true);
  assert.equal(result.kind, "active");
  assert.equal(result.userId, "auth-user");
  assert.equal(exchanged, 0);
});

test("thrown password-link application validation signs out its new session", async () => {
  let signedOut = 0;
  const result = await establishPasswordLinkSession(
    authClient({ signOut: async () => { signedOut += 1; } }),
    { code: "single-use-code", hasAuthParameters: true },
    async () => { throw new Error("validation unavailable"); }
  );

  assert.equal(result.kind, "unavailable");
  assert.equal(signedOut, 1);
});

test("inactive application account cannot use password setup", async () => {
  let signedOut = 0;
  const result = await establishPasswordLinkSession(
    authClient({ signOut: async () => { signedOut += 1; } }),
    { code: "single-use-code", hasAuthParameters: true },
    async () => ({ kind: "denied", reason: "disabled" })
  );

  assert.equal(result.kind, "denied");
  assert.equal(signedOut, 1);
});

test("password setup updates and preserves the same Auth identity", async () => {
  let update;
  const client = authClient({
    updateUser: async (value) => {
      update = value;
      return { data: { user: { id: "auth-user" } }, error: null };
    }
  });

  const result = await updateSameUserPassword(client, {
    password: "not-recorded-after-call",
    userId: "auth-user"
  });

  assert.deepEqual(update, { password: "not-recorded-after-call" });
  assert.deepEqual(result, { kind: "updated", userId: "auth-user" });
});

test("password setup rejects an unexpected identity change", async () => {
  let signedOut = 0;
  const result = await updateSameUserPassword(
    authClient({
      updateUser: async () => ({
        data: { user: { id: "different-user" } },
        error: null
      }),
      signOut: async () => { signedOut += 1; }
    }),
    { password: "not-recorded-after-call", userId: "auth-user" }
  );

  assert.equal(result.kind, "identity-mismatch");
  assert.equal(signedOut, 1);
});

test("auth UI introduces no signup, password persistence, or credential logging", async () => {
  const sources = await Promise.all([
    readFile(new URL("../login.mjs", import.meta.url), "utf8"),
    readFile(new URL("../password-update.mjs", import.meta.url), "utf8"),
    readFile(new URL("../auth-flows.mjs", import.meta.url), "utf8")
  ]);
  const source = sources.join("\n");

  assert.equal(/\.signUp\s*\(/.test(source), false);
  assert.equal(/(?:localStorage|sessionStorage)\.setItem\([^)]*password/i.test(source), false);
  assert.equal(/console\.(?:log|error|warn)\s*\(/.test(source), false);
});

test("login form cannot natively serialize credentials before initialization", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../../login.html", import.meta.url), "utf8"),
    readFile(new URL("../login.mjs", import.meta.url), "utf8")
  ]);
  const formStart = html.indexOf("<form");
  const formEnd = html.indexOf("</form>", formStart);
  const formMarkup = html.slice(formStart, formEnd);
  const handlerPosition = script.indexOf('form.addEventListener("submit"');
  const revealPosition = script.lastIndexOf("form.hidden = false");

  assert.match(formMarkup, /data-auth-login-form[^>]*\shidden(?:\s|>)/);
  assert.doesNotMatch(formMarkup, /name=["'](?:email|password)["']/i);
  assert.ok(handlerPosition >= 0);
  assert.ok(revealPosition > handlerPosition);
});
