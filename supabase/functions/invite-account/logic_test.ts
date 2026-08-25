import {
  AuthInviteFailure,
  createInviteHandler,
  type InviteDependencies,
  type InvitationRecord,
  MAX_BODY_BYTES,
  WorkspaceSlugConflictFailure,
} from "./logic.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message = "Values differ") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function post(body: unknown, token = "valid.jwt.value"): Request {
  return new Request("http://localhost/functions/v1/invite-account", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function testDependencies(overrides: Partial<InviteDependencies> = {}) {
  let invitation: InvitationRecord = {
    id: "00000000-0000-0000-0000-000000001001",
    status: "approved",
    approved_roles: ["private_member", "artist"],
    expires_at: "2099-01-01T00:00:00.000Z",
  };
  let inviteCalls = 0;
  let approvedRoles: readonly string[] = [];
  let approvedWorkspace: unknown = null;
  let repairInput: unknown = null;
  let failureCode: string | null = null;

  const dependencies: InviteDependencies = {
    allowedOrigins: new Set(),
    async verifyCaller() {
      return { id: "00000000-0000-0000-0000-000000000001" };
    },
    async readCallerAuthorization() {
      return { accountStatus: "active", isAdmin: true };
    },
    async approveInvitation(input) {
      approvedRoles = input.roles;
      approvedWorkspace = input.artistWorkspace;
      invitation = {
        ...invitation,
        approved_roles: [...input.roles],
        artist_workspace_display_name: input.artistWorkspace?.displayName ?? null,
        artist_workspace_slug: input.artistWorkspace?.slug ?? null,
      };
      return { invitation, created: true };
    },
    async claimInvitationForSending() {
      invitation = { ...invitation, status: "sending" };
      return invitation;
    },
    async readInvitation() {
      return invitation;
    },
    async inviteAuthUser() {
      inviteCalls += 1;
      invitation = { ...invitation, status: "sent" };
    },
    async markInvitationFailed(_id, code) {
      failureCode = code;
      invitation = { ...invitation, status: "failed" };
    },
    async repairAcceptedArtistWorkspace(input) {
      repairInput = input;
    },
    ...overrides,
  };

  return {
    handler: createInviteHandler(dependencies),
    get inviteCalls() {
      return inviteCalls;
    },
    get approvedRoles() {
      return approvedRoles;
    },
    get approvedWorkspace() {
      return approvedWorkspace;
    },
    get repairInput() {
      return repairInput;
    },
    get failureCode() {
      return failureCode;
    },
  };
}

Deno.test("missing JWT is rejected before request processing", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ email: "person@example.test", roles: [] }),
  }));
  assertEquals(response.status, 401);
  assertEquals((await responseBody(response)).code, "missing_authorization");
});

Deno.test("invalid JWT is rejected", async () => {
  const fixture = testDependencies({
    async verifyCaller() {
      throw new Error("invalid signature");
    },
  });
  const response = await fixture.handler(post({ email: "person@example.test", roles: [] }, "invalid"));
  assertEquals(response.status, 401);
  assertEquals((await responseBody(response)).code, "invalid_token");
});

Deno.test("authenticated non-admin is rejected", async () => {
  const fixture = testDependencies({
    async readCallerAuthorization() {
      return { accountStatus: "active", isAdmin: false };
    },
  });
  const response = await fixture.handler(post({
    action: "repair_artist_workspace",
    invitationId: "00000000-0000-4000-8000-000000001002",
    artistWorkspace: { displayName: "Blocked Repair", slug: "blocked-repair" },
  }));
  assertEquals(response.status, 403);
  assertEquals((await responseBody(response)).code, "admin_required");
  assertEquals(fixture.repairInput, null);
});

Deno.test("suspended admin is rejected before service operations", async () => {
  const fixture = testDependencies({
    async readCallerAuthorization() {
      return { accountStatus: "suspended", isAdmin: true };
    },
  });
  const response = await fixture.handler(post({ email: "person@example.test", roles: [] }));
  assertEquals(response.status, 403);
  assertEquals((await responseBody(response)).code, "account_inactive");
});

Deno.test("active admin can issue a successful invitation", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(post({
    email: "ARTIST@EXAMPLE.TEST",
    roles: ["artist"],
    artistWorkspace: { displayName: "Artist Name", slug: "ARTIST-NAME" },
  }));
  const body = await responseBody(response);
  assertEquals(response.status, 201);
  assertEquals(body.code, "invitation_sent");
  assertEquals(fixture.inviteCalls, 1);
  assertEquals(fixture.approvedWorkspace, { displayName: "Artist Name", slug: "artist-name" });
});

Deno.test("artist invitation requires explicit workspace identity", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(post({ email: "artist@example.test", roles: ["artist"] }));
  assertEquals(response.status, 400);
  assertEquals((await responseBody(response)).code, "invalid_artist_workspace");
  assertEquals(fixture.inviteCalls, 0);
});

Deno.test("non-artist invitation rejects workspace data", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(post({
    email: "member@example.test",
    roles: [],
    artistWorkspace: { displayName: "Not An Artist", slug: "not-an-artist" },
  }));
  assertEquals(response.status, 400);
  assertEquals((await responseBody(response)).code, "invalid_artist_workspace");
});

Deno.test("workspace slug conflict is rejected before Auth dispatch", async () => {
  const fixture = testDependencies({
    async approveInvitation() {
      throw new WorkspaceSlugConflictFailure();
    },
  });
  const response = await fixture.handler(post({
    email: "artist@example.test",
    roles: ["artist"],
    artistWorkspace: { displayName: "Artist", slug: "artist" },
  }));
  assertEquals(response.status, 409);
  assertEquals((await responseBody(response)).code, "artist_workspace_slug_conflict");
  assertEquals(fixture.inviteCalls, 0);
});

Deno.test("active admin can repair an accepted artist workspace without dispatching Auth", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(post({
    action: "repair_artist_workspace",
    invitationId: "00000000-0000-4000-8000-000000001001",
    artistWorkspace: { displayName: "Repair Artist", slug: "REPAIR-ARTIST" },
  }));
  assertEquals(response.status, 200);
  assertEquals((await responseBody(response)).code, "artist_workspace_repaired");
  assertEquals(fixture.repairInput, {
    invitationId: "00000000-0000-4000-8000-000000001001",
    artistWorkspace: { displayName: "Repair Artist", slug: "repair-artist" },
    approvedByAccountId: "00000000-0000-0000-0000-000000000001",
  });
  assertEquals(fixture.inviteCalls, 0);
});

Deno.test("malformed email is rejected", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(post({ email: "not-an-email", roles: [] }));
  assertEquals(response.status, 400);
  assertEquals((await responseBody(response)).code, "invalid_email");
});

Deno.test("empty requested roles becomes private_member only", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(post({ email: "member@example.test", roles: [] }));
  assertEquals(response.status, 201);
  assertEquals(fixture.approvedRoles, ["private_member"]);
});

Deno.test("admin role assignment is forbidden", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(post({ email: "person@example.test", roles: ["admin"] }));
  assertEquals(response.status, 400);
  assertEquals((await responseBody(response)).code, "forbidden_role");
});

Deno.test("sent duplicate request is idempotent and sends no second email", async () => {
  const sent: InvitationRecord = {
    id: "00000000-0000-0000-0000-000000001002",
    status: "sent",
    approved_roles: ["private_member"],
    expires_at: "2099-01-01T00:00:00.000Z",
  };
  const fixture = testDependencies({
    async approveInvitation() {
      return { invitation: sent, created: false };
    },
  });
  const response = await fixture.handler(post({ email: "member@example.test", roles: [] }));
  assertEquals(response.status, 200);
  assertEquals((await responseBody(response)).code, "invitation_already_sent");
  assertEquals(fixture.inviteCalls, 0);
});

Deno.test("concurrent sending request does not dispatch twice", async () => {
  const sending: InvitationRecord = {
    id: "00000000-0000-0000-0000-000000001003",
    status: "sending",
    approved_roles: ["private_member"],
    expires_at: "2099-01-01T00:00:00.000Z",
  };
  const fixture = testDependencies({
    async approveInvitation() {
      return { invitation: sending, created: false };
    },
  });
  const response = await fixture.handler(post({ email: "member@example.test", roles: [] }));
  assertEquals(response.status, 202);
  assertEquals((await responseBody(response)).code, "invitation_processing");
  assertEquals(fixture.inviteCalls, 0);
});

Deno.test("Auth API failure is recorded with a sanitized code", async () => {
  const fixture = testDependencies({
    async inviteAuthUser() {
      throw new AuthInviteFailure(429);
    },
  });
  const response = await fixture.handler(post({ email: "person@example.test", roles: [] }));
  assertEquals(response.status, 502);
  assertEquals((await responseBody(response)).code, "invitation_failed");
  assertEquals(fixture.failureCode, "auth_rate_limited");
});

Deno.test("failure response never exposes secrets or action links", async () => {
  const fixture = testDependencies({
    async inviteAuthUser() {
      throw new Error("secret-key action_link=https://example.test/confirm?token=otp-value");
    },
  });
  const response = await fixture.handler(post({ email: "person@example.test", roles: [] }));
  const raw = await response.text();
  assert(!raw.includes("secret-key"));
  assert(!raw.includes("action_link"));
  assert(!raw.includes("otp-value"));
  assertEquals(JSON.parse(raw).code, "invitation_failed");
});

Deno.test("successful response contains no email confirmation material", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(post({ email: "person@example.test", roles: [] }));
  const raw = await response.text();
  assert(!raw.includes("person@example.test"));
  assert(!raw.includes("token"));
  assert(!raw.includes("confirmation"));
  assertEquals(JSON.parse(raw).code, "invitation_sent");
});

Deno.test("malformed JSON receives a stable safe error", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(new Request("http://localhost", {
    method: "POST",
    headers: {
      authorization: "Bearer valid.jwt.value",
      "content-type": "application/json",
    },
    body: "{not-json",
  }));
  assertEquals(response.status, 400);
  assertEquals((await responseBody(response)).code, "invalid_json");
});

Deno.test("oversized body is rejected", async () => {
  const fixture = testDependencies();
  const response = await fixture.handler(new Request("http://localhost", {
    method: "POST",
    headers: {
      authorization: "Bearer valid.jwt.value",
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: "person@example.test", roles: [], padding: "x".repeat(MAX_BODY_BYTES) }),
  }));
  assertEquals(response.status, 413);
  assertEquals((await responseBody(response)).code, "body_too_large");
});
