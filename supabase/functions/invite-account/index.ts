import {
  AuthInviteFailure,
  createInviteHandler,
  type InvitationRecord,
  InvitationConflictFailure,
  type AllowedRole,
} from "./logic.ts";

const supabaseUrl = requiredEnvironment("SUPABASE_URL");
const publishableKey = requiredEnvironment("SUPABASE_ANON_KEY");
const configuredRedirect = Deno.env.get("INVITE_REDIRECT_URL")?.trim() || null;
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_INVITE_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment: ${name}`);
  return value;
}

function serviceCredential(): string {
  const value = Deno.env.get("SUPABASE_SECRET_KEY")?.trim()
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!value) throw new Error("Missing server-side Supabase credential");
  return value;
}

function restUrl(path: string, parameters: Record<string, string>): URL {
  const url = new URL(`/rest/v1/${path}`, supabaseUrl);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function serviceHeaders(extra: HeadersInit = {}): Headers {
  const credential = serviceCredential();
  const headers = new Headers(extra);
  headers.set("apikey", credential);
  headers.set("authorization", `Bearer ${credential}`);
  headers.set("content-type", "application/json");
  return headers;
}

async function parseRows(response: Response): Promise<InvitationRecord[]> {
  if (!response.ok) throw new Error("Invitation database operation failed");
  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new Error("Unexpected invitation response");
  return value as InvitationRecord[];
}

async function readInvitationById(id: string): Promise<InvitationRecord | null> {
  const response = await fetch(
    restUrl("account_invitations", {
      id: `eq.${id}`,
      select: "id,status,approved_roles,expires_at",
      limit: "1",
    }),
    { headers: serviceHeaders() },
  );
  const rows = await parseRows(response);
  return rows[0] ?? null;
}

async function readActionableInvitation(
  email: string,
): Promise<InvitationRecord | null> {
  const response = await fetch(
    restUrl("account_invitations", {
      email_normalized: `eq.${email}`,
      status: "in.(approved,sending,sent)",
      select: "id,status,approved_roles,expires_at",
      order: "created_at.desc",
      limit: "1",
    }),
    { headers: serviceHeaders() },
  );
  const rows = await parseRows(response);
  return rows[0] ?? null;
}

function sameRoles(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((role, index) => role === right[index]);
}

const handler = createInviteHandler({
  allowedOrigins,

  async verifyCaller(token) {
    const response = await fetch(new URL("/auth/v1/user", supabaseUrl), {
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error("Invalid caller token");
    const user: unknown = await response.json();
    if (!user || typeof user !== "object" || !("id" in user)) {
      throw new Error("Invalid caller identity");
    }
    return { id: String((user as { id: unknown }).id) };
  },

  async readCallerAuthorization(callerId, token) {
    const callerHeaders = {
      apikey: publishableKey,
      authorization: `Bearer ${token}`,
    };

    const [accountResponse, roleResponse] = await Promise.all([
      fetch(
        restUrl("accounts", {
          id: `eq.${callerId}`,
          select: "status",
          limit: "1",
        }),
        { headers: callerHeaders },
      ),
      fetch(
        restUrl("account_roles", {
          account_id: `eq.${callerId}`,
          role: "eq.admin",
          revoked_at: "is.null",
          select: "id",
          limit: "1",
        }),
        { headers: callerHeaders },
      ),
    ]);

    if (!accountResponse.ok || !roleResponse.ok) {
      throw new Error("Caller authorization lookup failed");
    }

    const accounts = await accountResponse.json() as Array<{ status: string }>;
    const roles = await roleResponse.json() as Array<{ id: string }>;
    const status = accounts[0]?.status;

    return {
      accountStatus: status === "active" || status === "suspended" || status === "disabled"
        ? status
        : null,
      isAdmin: roles.length === 1,
    };
  },

  async approveInvitation({ email, roles, approvedByAccountId }) {
    const response = await fetch(
      restUrl("account_invitations", {
        select: "id,status,approved_roles,expires_at",
      }),
      {
        method: "POST",
        headers: serviceHeaders({ prefer: "return=representation" }),
        body: JSON.stringify({
          email_normalized: email,
          approved_roles: roles,
          approved_by_account_id: approvedByAccountId,
        }),
      },
    );

    if (response.ok) {
      const rows = await parseRows(response);
      if (!rows[0]) throw new Error("Invitation approval returned no row");
      return { invitation: rows[0], created: true };
    }

    if (response.status !== 409) {
      throw new Error("Invitation approval failed");
    }

    const existing = await readActionableInvitation(email);
    if (!existing || !sameRoles(existing.approved_roles, roles)) {
      throw new InvitationConflictFailure();
    }

    return { invitation: existing, created: false };
  },

  async claimInvitationForSending(id) {
    const response = await fetch(
      restUrl("account_invitations", {
        id: `eq.${id}`,
        status: "eq.approved",
        select: "id,status,approved_roles,expires_at",
      }),
      {
        method: "PATCH",
        headers: serviceHeaders({ prefer: "return=representation" }),
        body: JSON.stringify({ status: "sending" }),
      },
    );
    const rows = await parseRows(response);
    return rows[0] ?? null;
  },

  readInvitation: readInvitationById,

  async inviteAuthUser(email) {
    const credential = serviceCredential();
    const url = new URL("/auth/v1/invite", supabaseUrl);
    if (configuredRedirect) url.searchParams.set("redirect_to", configuredRedirect);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: credential,
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) throw new AuthInviteFailure(response.status);
  },

  async markInvitationFailed(id, failureCode) {
    const response = await fetch(
      restUrl("account_invitations", {
        id: `eq.${id}`,
        status: "in.(approved,sending,sent)",
      }),
      {
        method: "PATCH",
        headers: serviceHeaders({ prefer: "return=minimal" }),
        body: JSON.stringify({
          status: "failed",
          failure_code: failureCode,
        }),
      },
    );
    if (!response.ok) throw new Error("Unable to record invitation failure");
  },
});

Deno.serve(handler);
