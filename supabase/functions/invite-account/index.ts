import {
  AuthInviteFailure,
  createInviteHandler,
  InternalFailure,
  type InvitationRecord,
  InvitationConflictFailure,
  WorkspaceSlugConflictFailure,
  type AllowedRole,
} from "./logic.ts";
import {
  elevatedServiceHeaders,
  resolveSupabaseApiKeys,
  userScopedHeaders,
} from "../_shared/supabase-api-keys.ts";

class InvalidCallerFailure extends Error {}

const supabaseUrl = requiredEnvironment("SUPABASE_URL");
const apiKeys = resolveSupabaseApiKeys((name) => Deno.env.get(name));
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

function restUrl(path: string, parameters: Record<string, string>): URL {
  const url = new URL(`/rest/v1/${path}`, supabaseUrl);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function serviceHeaders(extra: HeadersInit = {}): Headers {
  const headers = elevatedServiceHeaders(apiKeys.secret, extra);
  headers.set("content-type", "application/json");
  return headers;
}

async function fetchInternal(
  stage: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new InternalFailure(stage);
  }
}

async function parseRows(
  response: Response,
  stage: string,
): Promise<InvitationRecord[]> {
  if (!response.ok) throw new InternalFailure(stage, response.status);

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new InternalFailure(stage, response.status);
  }
  if (!Array.isArray(value)) throw new InternalFailure(stage, response.status);
  return value as InvitationRecord[];
}

async function readInvitationById(id: string): Promise<InvitationRecord | null> {
  const response = await fetchInternal(
    "invitation_relink_read",
    restUrl("account_invitations", {
      id: `eq.${id}`,
      select: "id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug",
      limit: "1",
    }),
    { headers: serviceHeaders() },
  );
  const rows = await parseRows(response, "invitation_relink_read");
  return rows[0] ?? null;
}

async function readActionableInvitation(
  email: string,
): Promise<InvitationRecord | null> {
  const response = await fetchInternal(
    "actionable_invitation_read",
    restUrl("account_invitations", {
      email_normalized: `eq.${email}`,
      status: "in.(approved,sending,sent)",
      select: "id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug",
      order: "created_at.desc",
      limit: "1",
    }),
    { headers: serviceHeaders() },
  );
  const rows = await parseRows(response, "actionable_invitation_read");
  return rows[0] ?? null;
}

async function readActionableInvitationByWorkspaceSlug(
  slug: string,
): Promise<InvitationRecord | null> {
  const response = await fetchInternal(
    "actionable_workspace_slug_read",
    restUrl("account_invitations", {
      artist_workspace_slug: `eq.${slug}`,
      status: "in.(approved,sending,sent)",
      select: "id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug",
      order: "created_at.desc",
      limit: "1",
    }),
    { headers: serviceHeaders() },
  );
  const rows = await parseRows(response, "actionable_workspace_slug_read");
  return rows[0] ?? null;
}

async function existingProfileUsesSlug(slug: string): Promise<boolean> {
  const response = await fetchInternal(
    "existing_profile_slug_lookup",
    restUrl("public_profiles", {
      slug: `eq.${slug}`,
      deleted_at: "is.null",
      select: "id",
      limit: "1",
    }),
    { headers: serviceHeaders() },
  );
  if (!response.ok) {
    throw new InternalFailure("existing_profile_slug_lookup", response.status);
  }
  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new InternalFailure("existing_profile_slug_lookup", response.status);
  }
  return Array.isArray(rows) && rows.length > 0;
}

function sameRoles(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((role, index) => role === right[index]);
}

function samePlan(left: string, right: InvitationRecord): boolean {
  return left === right.approved_account_plan;
}

function sameWorkspace(
  left: { displayName: string; slug: string } | null,
  right: InvitationRecord,
): boolean {
  if (!left) {
    return !right.artist_workspace_display_name && !right.artist_workspace_slug;
  }
  return left.displayName === right.artist_workspace_display_name
    && left.slug === right.artist_workspace_slug;
}

const handler = createInviteHandler({
  allowedOrigins,

  async verifyCaller(token) {
    const response = await fetchInternal("verify_caller_auth_request", new URL("/auth/v1/user", supabaseUrl), {
      headers: userScopedHeaders(apiKeys.publishable, `Bearer ${token}`),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new InvalidCallerFailure();
      }
      throw new InternalFailure("verify_caller_auth_request", response.status);
    }
    let user: unknown;
    try {
      user = await response.json();
    } catch {
      throw new InternalFailure("verify_caller_auth_request", response.status);
    }
    if (!user || typeof user !== "object" || !("id" in user)) {
      throw new InvalidCallerFailure();
    }
    return { id: String((user as { id: unknown }).id) };
  },

  async readCallerAuthorization(callerId, token) {
    const callerHeaders = userScopedHeaders(
      apiKeys.publishable,
      `Bearer ${token}`,
    );

    const [accountResponse, roleResponse] = await Promise.all([
      fetchInternal(
        "caller_account_authorization_lookup",
        restUrl("accounts", {
          id: `eq.${callerId}`,
          select: "status",
          limit: "1",
        }),
        { headers: callerHeaders },
      ),
      fetchInternal(
        "caller_admin_role_lookup",
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

    if (!accountResponse.ok) {
      throw new InternalFailure(
        "caller_account_authorization_lookup",
        accountResponse.status,
      );
    }
    if (!roleResponse.ok) {
      throw new InternalFailure(
        "caller_admin_role_lookup",
        roleResponse.status,
      );
    }

    let accounts: unknown;
    let roles: unknown;
    try {
      [accounts, roles] = await Promise.all([
        accountResponse.json(),
        roleResponse.json(),
      ]);
    } catch {
      throw new InternalFailure("caller_authorization_lookup");
    }
    if (!Array.isArray(accounts) || !Array.isArray(roles)) {
      throw new InternalFailure("caller_authorization_lookup");
    }
    const status = (accounts[0] as { status?: unknown } | undefined)?.status;

    return {
      accountStatus: status === "active" || status === "suspended" || status === "disabled"
        ? status
        : null,
      isAdmin: roles.length === 1,
    };
  },

  async approveInvitation({ email, roles, approvedAccountPlan, artistWorkspace, approvedByAccountId }) {
    if (artistWorkspace && await existingProfileUsesSlug(artistWorkspace.slug)) {
      throw new WorkspaceSlugConflictFailure();
    }

    const response = await fetchInternal(
      "invitation_approval_insert",
      restUrl("account_invitations", {
        select: "id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug",
      }),
      {
        method: "POST",
        headers: serviceHeaders({ prefer: "return=representation" }),
        body: JSON.stringify({
          email_normalized: email,
          approved_roles: roles,
          approved_account_plan: approvedAccountPlan,
          artist_workspace_display_name: artistWorkspace?.displayName ?? null,
          artist_workspace_slug: artistWorkspace?.slug ?? null,
          approved_by_account_id: approvedByAccountId,
        }),
      },
    );

    if (response.ok) {
      const rows = await parseRows(response, "invitation_approval_insert");
      if (!rows[0]) throw new InternalFailure("invitation_approval_insert", response.status);
      return { invitation: rows[0], created: true };
    }

    if (response.status !== 409) {
      throw new InternalFailure("invitation_approval_insert", response.status);
    }

    const existing = await readActionableInvitation(email);
    if (
      existing
      && sameRoles(existing.approved_roles, roles)
      && samePlan(approvedAccountPlan, existing)
      && sameWorkspace(artistWorkspace, existing)
    ) {
      return { invitation: existing, created: false };
    }

    if (artistWorkspace && await readActionableInvitationByWorkspaceSlug(artistWorkspace.slug)) {
      throw new WorkspaceSlugConflictFailure();
    }

    if (!existing) {
      throw new InvitationConflictFailure();
    }

    throw new InvitationConflictFailure();
  },

  async claimInvitationForSending(id) {
    const response = await fetchInternal(
      "claim_invitation",
      restUrl("account_invitations", {
        id: `eq.${id}`,
        status: "eq.approved",
        select: "id,status,approved_roles,approved_account_plan,expires_at,artist_workspace_display_name,artist_workspace_slug",
      }),
      {
        method: "PATCH",
        headers: serviceHeaders({ prefer: "return=representation" }),
        body: JSON.stringify({ status: "sending" }),
      },
    );
    const rows = await parseRows(response, "claim_invitation");
    return rows[0] ?? null;
  },

  readInvitation: readInvitationById,

  async inviteAuthUser(email) {
    const url = new URL("/auth/v1/invite", supabaseUrl);
    if (configuredRedirect) url.searchParams.set("redirect_to", configuredRedirect);

    const response = await fetchInternal("auth_invite_request", url, {
      method: "POST",
      headers: serviceHeaders({
        "content-type": "application/json",
      }),
      body: JSON.stringify({ email }),
    });

    if (!response.ok) throw new AuthInviteFailure(response.status);
  },

  async markInvitationFailed(id, failureCode) {
    const response = await fetchInternal(
      "failure_state_write",
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
    if (!response.ok) {
      throw new InternalFailure("failure_state_write", response.status);
    }
  },

  async repairAcceptedArtistWorkspace({
    invitationId,
    artistWorkspace,
    approvedByAccountId,
  }) {
    const response = await fetchInternal(
      "artist_workspace_repair",
      restUrl("rpc/service_repair_accepted_artist_workspace", {}),
      {
        method: "POST",
        headers: serviceHeaders(),
        body: JSON.stringify({
          target_invitation_id: invitationId,
          target_display_name: artistWorkspace.displayName,
          target_slug: artistWorkspace.slug,
          actor_account_id: approvedByAccountId,
        }),
      },
    );
    if (!response.ok) {
      throw new InternalFailure("artist_workspace_repair", response.status);
    }
  },
});

Deno.serve(handler);
