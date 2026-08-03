export const MAX_BODY_BYTES = 8192;

export const ALLOWED_ROLES = [
  "private_member",
  "artist",
  "curator",
  "institution",
] as const;

export type AllowedRole = (typeof ALLOWED_ROLES)[number];

export type InvitationStatus =
  | "approved"
  | "sending"
  | "sent"
  | "accepted"
  | "expired"
  | "revoked"
  | "failed";

export interface InvitationRecord {
  id: string;
  status: InvitationStatus;
  approved_roles: AllowedRole[];
  expires_at: string;
}

export interface ApprovalResult {
  invitation: InvitationRecord;
  created: boolean;
}

export interface CallerAuthorization {
  accountStatus: "active" | "suspended" | "disabled" | null;
  isAdmin: boolean;
}

export interface InviteDependencies {
  verifyCaller(token: string): Promise<{ id: string }>;
  readCallerAuthorization(
    callerId: string,
    token: string,
  ): Promise<CallerAuthorization>;
  approveInvitation(input: {
    email: string;
    roles: AllowedRole[];
    approvedByAccountId: string;
  }): Promise<ApprovalResult>;
  claimInvitationForSending(id: string): Promise<InvitationRecord | null>;
  readInvitation(id: string): Promise<InvitationRecord | null>;
  inviteAuthUser(email: string): Promise<void>;
  markInvitationFailed(id: string, failureCode: string): Promise<void>;
  allowedOrigins: ReadonlySet<string>;
}

class RequestFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export class AuthInviteFailure extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Auth invitation request failed");
    this.status = status;
  }
}

export class InvitationConflictFailure extends Error {
  constructor() {
    super("An actionable invitation already exists with different roles");
  }
}

function jsonResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
  corsHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify({ ok: status < 400, code, ...extra }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders,
    },
  });
}

function resolveCors(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): HeadersInit {
  const origin = request.headers.get("origin");

  if (!origin) return {};
  if (!allowedOrigins.has(origin)) {
    throw new RequestFailure(403, "origin_not_allowed");
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new RequestFailure(400, "invalid_email");
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new RequestFailure(400, "invalid_email");
  }

  return normalized;
}

export function normalizeRoles(value: unknown): AllowedRole[] {
  if (!Array.isArray(value)) {
    throw new RequestFailure(400, "invalid_roles");
  }

  const requested = new Set<string>(["private_member"]);
  for (const role of value) {
    if (typeof role !== "string") {
      throw new RequestFailure(400, "invalid_roles");
    }
    if (role === "admin") {
      throw new RequestFailure(400, "forbidden_role");
    }
    if (!(ALLOWED_ROLES as readonly string[]).includes(role)) {
      throw new RequestFailure(400, "invalid_roles");
    }
    requested.add(role);
  }

  return ALLOWED_ROLES.filter((role) => requested.has(role));
}

export function sanitizedAuthFailureCode(error: unknown): string {
  if (!(error instanceof AuthInviteFailure)) return "auth_invite_failed";
  if (error.status === 409 || error.status === 422) return "auth_user_conflict";
  if (error.status === 429) return "auth_rate_limited";
  if (error.status >= 500) return "auth_unavailable";
  return "auth_invite_failed";
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RequestFailure(413, "body_too_large");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new RequestFailure(413, "body_too_large");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new RequestFailure(400, "invalid_json");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestFailure(400, "invalid_json");
  }

  return parsed as Record<string, unknown>;
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) throw new RequestFailure(401, "missing_authorization");
  return match[1];
}

async function acquireDispatch(
  dependencies: InviteDependencies,
  approval: ApprovalResult,
): Promise<{ invitation: InvitationRecord; dispatch: boolean }> {
  const current = approval.invitation;

  if (current.status === "sent") {
    return { invitation: current, dispatch: false };
  }
  if (current.status === "sending") {
    return { invitation: current, dispatch: false };
  }
  if (current.status !== "approved") {
    throw new RequestFailure(409, "invitation_conflict");
  }

  const claimed = await dependencies.claimInvitationForSending(current.id);
  if (claimed) return { invitation: claimed, dispatch: true };

  const raced = await dependencies.readInvitation(current.id);
  if (raced?.status === "sent" || raced?.status === "sending") {
    return { invitation: raced, dispatch: false };
  }

  throw new RequestFailure(409, "invitation_conflict");
}

export function createInviteHandler(dependencies: InviteDependencies) {
  return async (request: Request): Promise<Response> => {
    let corsHeaders: HeadersInit = {};

    try {
      corsHeaders = resolveCors(request, dependencies.allowedOrigins);

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      if (request.method !== "POST") {
        throw new RequestFailure(405, "method_not_allowed");
      }

      const token = bearerToken(request);
      let caller: { id: string };
      try {
        caller = await dependencies.verifyCaller(token);
      } catch {
        throw new RequestFailure(401, "invalid_token");
      }

      const authorization = await dependencies.readCallerAuthorization(
        caller.id,
        token,
      );
      if (authorization.accountStatus !== "active") {
        throw new RequestFailure(403, "account_inactive");
      }
      if (!authorization.isAdmin) {
        throw new RequestFailure(403, "admin_required");
      }

      const body = await parseBody(request);
      const email = normalizeEmail(body.email);
      const roles = normalizeRoles(body.roles);

      const approval = await dependencies.approveInvitation({
        email,
        roles,
        approvedByAccountId: caller.id,
      });

      const dispatch = await acquireDispatch(dependencies, approval);
      if (!dispatch.dispatch) {
        const code = dispatch.invitation.status === "sent"
          ? "invitation_already_sent"
          : "invitation_processing";
        const status = dispatch.invitation.status === "sent" ? 200 : 202;
        return jsonResponse(
          status,
          code,
          { invitationId: dispatch.invitation.id },
          corsHeaders,
        );
      }

      try {
        await dependencies.inviteAuthUser(email);
      } catch (error) {
        await dependencies.markInvitationFailed(
          dispatch.invitation.id,
          sanitizedAuthFailureCode(error),
        );
        return jsonResponse(
          502,
          "invitation_failed",
          { invitationId: dispatch.invitation.id },
          corsHeaders,
        );
      }

      const linked = await dependencies.readInvitation(dispatch.invitation.id);
      if (linked?.status !== "sent") {
        await dependencies.markInvitationFailed(
          dispatch.invitation.id,
          "auth_link_missing",
        );
        return jsonResponse(
          502,
          "invitation_failed",
          { invitationId: dispatch.invitation.id },
          corsHeaders,
        );
      }

      return jsonResponse(
        approval.created ? 201 : 200,
        "invitation_sent",
        { invitationId: linked.id },
        corsHeaders,
      );
    } catch (error) {
      if (error instanceof InvitationConflictFailure) {
        return jsonResponse(409, "invitation_conflict", {}, corsHeaders);
      }
      if (error instanceof RequestFailure) {
        return jsonResponse(error.status, error.code, {}, corsHeaders);
      }
      return jsonResponse(500, "internal_error", {}, corsHeaders);
    }
  };
}
