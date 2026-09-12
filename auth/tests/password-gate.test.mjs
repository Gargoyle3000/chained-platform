import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  updateSameUserPasswordAndConfirm
} from "../auth-flows.mjs";
import {
  passwordGateDecision,
  readCurrentAccountPasswordState
} from "../session.mjs";

function clientForPasswordState(result) {
  return {
    rpc: async (name) => {
      assert.equal(name, "current_account_has_password");
      return result;
    },
    auth: {
      updateUser: async () => ({
        data: { user: { id: "auth-user" } },
        error: null
      })
    }
  };
}

test("password state is server-authoritative and maps only boolean RPC results", async () => {
  assert.deepEqual(
    await readCurrentAccountPasswordState(clientForPasswordState({ data: false, error: null })),
    { kind: "setup-required" }
  );
  assert.deepEqual(
    await readCurrentAccountPasswordState(clientForPasswordState({ data: true, error: null })),
    { kind: "ready" }
  );
  assert.deepEqual(
    await readCurrentAccountPasswordState(clientForPasswordState({ data: null, error: null })),
    { kind: "unavailable" }
  );
});

test("protected routes require password setup only for active sessions without a password", () => {
  assert.equal(passwordGateDecision({ kind: "setup-required" }), "password-update");
  assert.equal(passwordGateDecision({ kind: "ready" }), "allow");
  assert.equal(passwordGateDecision({ kind: "unavailable" }), "unavailable");
});

test("password setup confirms server state before allowing the dashboard", async () => {
  const client = clientForPasswordState({ data: true, error: null });
  const ready = await updateSameUserPasswordAndConfirm(client, {
    password: "not-recorded-after-call",
    userId: "auth-user"
  });
  assert.deepEqual(ready, { kind: "ready", userId: "auth-user" });

  const unconfirmed = await updateSameUserPasswordAndConfirm(
    clientForPasswordState({ data: false, error: null }),
    { password: "not-recorded-after-call", userId: "auth-user" }
  );
  assert.deepEqual(unconfirmed, { kind: "unconfirmed" });
});

test("password update remains outside the protected-page guard to avoid a redirect loop", async () => {
  const [page, guard] = await Promise.all([
    readFile(new URL("../../password-update.html", import.meta.url), "utf8"),
    readFile(new URL("../guard.mjs", import.meta.url), "utf8")
  ]);

  assert.doesNotMatch(page, /auth\/guard\.mjs/);
  assert.match(guard, /redirectToPasswordUpdate\(\)/);
  assert.match(guard, /readCurrentAccountPasswordState/);
});
