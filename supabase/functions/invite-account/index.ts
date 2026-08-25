import {
  AuthInviteFailure,
  createInviteHandler,
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
      select: "id,status,approved_roles,expires_at,artist_workspace_display_name,artist_workspace_slug",
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
      select: "id,status,approved_roles,expires_at,artist_workspace_display_name,artist_workspace_slug",
      order: "created_at.desc",
      limit: "1",
    }),
    { headers: serviceHeaders() },
  );
  const rows = await parseRows(response);
  return rows[0] ?? null;
}

async function readActionableInvitationByWorkspaceSlug(
  slug: string,
): Promise<InvitationRecord | null> {
  const response = await fetch(
    restUrl("account_invitations", {
      artist_workspace_slug: `eq.${slug}`,
      status: "in.(approved,sending,sent)",
      select: "id,status,approved_roles,expires_at,artist_workspace_display_name,artist_workspace_slug",
      order: "created_at.desc",
      limit: "1",
    }),
    { headers: serviceHeaders() },
  );
  const rows = await parseRows(response);
  return rows[0] ?? null;
}

async function existingProfileUsesSlug(slug: string): Promise<boolean> {
  const response = await fetch(
    restUrl("public_profiles", {
      slug: `eq.${slug}`,
      deleted_at: "is.null",
      select: "id",
      limit: "1",
    }),
    { headers: serviceHeaders() },
  );
  if (!response.ok) throw new Error("Profile slug lookup failed");
  const rows: unknown = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

function sameRoles(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((role, index) => role === right[index]);
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
    const response = await fetch(new URL("/auth/v1/user", supabaseUrl), {
      headers: userScopedHeaders(apiKeys.publishable, `Bearer ${token}`),
    });
    if (!response.ok) throw new Error("Invalid caller token");
    const user: unknown = await response.json();
    if (!user || typeof user !== "object" || !("id" in user)) {
      throw new Error("Invalid caller identity");
    }
    return { id: String((user as { id: unknown }).id) };
  },

  async readCallerAuthorization(callerId, token) {
    const callerHeaders = userScopedHeaders(
      apiKeys.publishable,
      `Bearer ${token}`,
    );

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

  async approveInvitation({ email, roles, artistWorkspace, approvedByAccountId }) {
    if (artistWorkspace && await existingProfileUsesSlug(artistWorkspace.slug)) {
      throw new WorkspaceSlugConflictFailure();
    }

    const response = await fetch(
      restUrl("account_invitations", {
        select: "id,status,approved_roles,expires_at,artist_workspace_display_name,artist_workspace_slug",
      }),
      {
        method: "POST",
        headers: serviceHeaders({ prefer: "return=representation" }),
        body: JSON.stringify({
          email_normalized: email,
          approved_roles: roles,
          artist_workspace_display_name: artistWorkspace?.displayName ?? null,
          artist_workspace_slug: artistWorkspace?.slug ?? null,
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
    if (existing && sameRoles(existing.approved_roles, roles) && sameWorkspace(artistWorkspace, existing)) {
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
    const response = await fetch(
      restUrl("account_invitations", {
        id: `eq.${id}`,
        status: "eq.approved",
        select: "id,status,approved_roles,expires_at,artist_workspace_display_name,artist_workspace_slug",
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
    const url = new URL("/auth/v1/invite", supabaseUrl);
    if (configuredRedirect) url.searchParams.set("redirect_to", configuredRedirect);

    const response = await fetch(url, {
      method: "POST",
      headers: serviceHeaders({
        "content-type": "application/json",
      }),
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

  async repairAcceptedArtistWorkspace({
    invitationId,
    artistWorkspace,
    approvedByAccountId,
  }) {
    const response = await fetch(
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
    if (!response.ok) throw new Error("Artist workspace repair failed");
  },
});

Deno.serve(handler);
