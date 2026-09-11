import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { readAdminAccess } from "../auth/admin-access.mjs";
import {
  createAdminInviteService,
  createAdminInviteSubmissionFlow,
  createArtistInvitationRequest,
  createArtistSlugFromName,
  invitationMessage
} from "../data/admin-invite-service.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("artist invitations use the fixed trusted request contract without a plan", async () => {
  let captured;
  const service = createAdminInviteService({
    invoke: async (_name, options) => {
      captured = options.body;
      return { data: { code: "invitation_sent" } };
    }
  });
  const flow = createAdminInviteSubmissionFlow(service);
  const result = await flow.submit({
    displayName: "  Koos Artist  ",
    email: " KOOS@EXAMPLE.TEST ",
    slug: "Koos Artist"
  });

  assert.deepEqual(result, { kind: "success", code: "invitation_sent" });
  assert.deepEqual(captured, {
    email: "koos@example.test",
    roles: ["artist"],
    artistWorkspace: { displayName: "Koos Artist", slug: "koos-artist" }
  });
  assert.equal("accountPlan" in captured, false);
  assert.equal("approvedAccountPlan" in captured, false);
});

test("artist invitation validation requires name, email, and canonical slug", () => {
  assert.deepEqual(createArtistInvitationRequest({
    displayName: "Artist", email: "invalid", slug: "artist"
  }), { kind: "invalid", code: "invalid_email" });
  assert.deepEqual(createArtistInvitationRequest({
    displayName: "", email: "artist@example.test", slug: "artist"
  }), { kind: "invalid", code: "invalid_artist_workspace" });
  assert.deepEqual(createArtistInvitationRequest({
    displayName: "Artist", email: "artist@example.test", slug: "---"
  }), { kind: "invalid", code: "invalid_artist_workspace" });
  assert.equal(createArtistSlugFromName("  José van Test!  "), "jose-van-test");
});

test("submission flow locks duplicate sends until the active request settles", async () => {
  let resolveRequest;
  let sends = 0;
  const flow = createAdminInviteSubmissionFlow({
    send: async () => {
      sends += 1;
      await new Promise((resolve) => { resolveRequest = resolve; });
      return { code: "invitation_sent" };
    }
  });
  const input = { displayName: "Artist", email: "artist@example.test", slug: "artist" };
  const first = flow.submit(input);
  assert.deepEqual(await flow.submit(input), { kind: "busy" });
  assert.equal(sends, 1);
  resolveRequest();
  assert.deepEqual(await first, { kind: "success", code: "invitation_sent" });
});

test("safe server errors map to concise invitation feedback", () => {
  for (const code of [
    "invalid_email", "invalid_artist_workspace", "artist_workspace_slug_conflict",
    "invitation_conflict", "invitation_already_sent", "invitation_processing",
    "invitation_failed", "admin_required", "account_inactive", "origin_not_allowed"
  ]) {
    assert.match(invitationMessage(code), /[A-Z]/);
  }
  assert.equal(invitationMessage("internal"), "INVITATION COULD NOT BE SENT. TRY AGAIN");
});

test("function failures expose only an approved server code", async () => {
  const service = createAdminInviteService({
    invoke: async () => ({
      error: {
        context: {
          clone: () => ({ json: async () => ({ code: "admin_required", detail: "private" }) })
        }
      }
    })
  });
  await assert.rejects(service.send({}), (error) => error.code === "admin_required");
});

function adminClient({ status = "active", roles = [{ role: "admin", revoked_at: null }] } = {}) {
  const query = (result) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => result,
        then: undefined
      })
    })
  });
  return {
    auth: { getUser: async () => ({ data: { user: { id: "account-id" } }, error: null }) },
    from: (table) => table === "accounts"
      ? query({ data: { status }, error: null })
      : {
        select: () => ({ eq: async () => ({ data: roles, error: null }) })
      }
  };
}

test("admin access requires an active account and unrevoke admin role", async () => {
  assert.deepEqual(await readAdminAccess(adminClient()), { kind: "admin" });
  assert.deepEqual(await readAdminAccess(adminClient({ roles: [{ role: "artist", revoked_at: null }] })), { kind: "admin_required" });
  assert.deepEqual(await readAdminAccess(adminClient({ status: "suspended" })), { kind: "account_inactive" });
  assert.deepEqual(await readAdminAccess({
    auth: { getUser: async () => { throw new Error("offline"); } }
  }), { kind: "unavailable" });
});

test("admin console remains artist-only, admin-guarded, and uses Profile URL copy", async () => {
  const [page, script, css, authLogic, navigation, service] = await Promise.all([
    read("dashboard-admin-invite.html"),
    read("dashboard-admin-invite.js"),
    read("dashboard.css"),
    read("auth/auth-logic.mjs"),
    read("auth/navigation.mjs"),
    read("data/admin-invite-service.mjs")
  ]);
  assert.match(page, /data-admin-protected="true"/);
  assert.match(page, /<h2>ADMIN CONSOLE<\/h2>/);
  assert.match(page, /<p class="dashboard-label">INVITATIONS<\/p>/);
  assert.match(page, /ARTIST INVITATION/);
  assert.match(page, /id="dashboard-admin-invite-name"/);
  assert.match(page, /id="dashboard-admin-invite-email"/);
  assert.match(page, /id="dashboard-admin-invite-slug"/);
  assert.match(page, /PROFILE URL/);
  assert.doesNotMatch(page, />SLUG</);
  assert.match(page, /data-admin-invitations-link[^>]*>ADMIN CONSOLE/);
  assert.doesNotMatch(page, /data-admin-invitations-link[^>]*>INVITATIONS/);
  assert.doesNotMatch(page, /ACCOUNT PLAN|SUBSCRIPTION|BILLING|PRIVATE_MEMBER/);
  assert.doesNotMatch(page, /accountPlan|approvedAccountPlan/);
  assert.match(script, /if \(flow\.sending\) return/);
  assert.match(script, /SENDING INVITATION/);
  assert.match(script, /form\.querySelectorAll\("input,button"\)/);
  assert.match(css, /\[data-admin-protected="true"\] \.dashboard-admin-invite-layout/);
  assert.match(css, /\.dashboard-admin-console-tool/);
  assert.match(authLogic, /"dashboard-admin-invite\.html"/);
  assert.match(navigation, /link\.textContent = "ADMIN CONSOLE"/);
  assert.doesNotMatch(navigation, /link\.textContent = "INVITATIONS"/);
  assert.match(service, /artistWorkspace: Object\.freeze\(\{ displayName, slug \}\)/);
});
