import { normalizeEmail } from "../auth/auth-logic.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CODES = new Set([
  "invalid_email",
  "invalid_artist_workspace",
  "artist_workspace_slug_conflict",
  "invitation_conflict",
  "invitation_already_sent",
  "invitation_processing",
  "invitation_failed",
  "admin_required",
  "account_inactive",
  "origin_not_allowed"
]);

export function normalizeArtistSlug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createArtistSlugFromName(value) {
  return normalizeArtistSlug(value);
}

export function createArtistInvitationRequest(input = {}) {
  const displayName = String(input.displayName ?? "").trim();
  const email = normalizeEmail(input.email);
  const slug = normalizeArtistSlug(input.slug);

  if (!email) {
    return Object.freeze({ kind: "invalid", code: "invalid_email" });
  }

  if (!displayName || displayName.length > 160 || !SLUG_PATTERN.test(slug)) {
    return Object.freeze({ kind: "invalid", code: "invalid_artist_workspace" });
  }

  return Object.freeze({
    kind: "valid",
    body: Object.freeze({
      email,
      roles: Object.freeze(["artist"]),
      artistWorkspace: Object.freeze({ displayName, slug })
    })
  });
}

export function invitationMessage(code) {
  const messages = {
    invitation_sent: "INVITATION SENT",
    invalid_email: "ENTER A VALID EMAIL",
    invalid_artist_workspace: "ENTER A VALID ARTIST NAME AND PROFILE URL",
    artist_workspace_slug_conflict: "THIS ARTIST SLUG IS ALREADY IN USE",
    invitation_conflict: "THIS EMAIL ALREADY HAS AN ACCOUNT",
    invitation_already_sent: "AN INVITATION HAS ALREADY BEEN SENT",
    invitation_processing: "THIS INVITATION IS ALREADY PROCESSING",
    invitation_failed: "THE PREVIOUS INVITATION FAILED. TRY AGAIN",
    admin_required: "ADMIN ACCESS REQUIRED",
    account_inactive: "YOUR ACCOUNT IS NOT ACTIVE",
    origin_not_allowed: "THIS INVITATION PAGE IS NOT AVAILABLE FROM THIS ORIGIN"
  };

  return messages[code] || "INVITATION COULD NOT BE SENT. TRY AGAIN";
}

function safeCode(value) {
  return SAFE_CODES.has(value) ? value : "internal";
}

async function responseCode(error) {
  const response = error?.context;
  if (!response || typeof response.clone !== "function") return "internal";

  try {
    return safeCode((await response.clone().json())?.code);
  } catch {
    return "internal";
  }
}

export function createAdminInviteService({ invoke }) {
  return Object.freeze({
    async send(body) {
      const result = await invoke("invite-account", { body });

      if (result?.error) {
        const code = await responseCode(result.error);
        throw Object.assign(new Error(code), { code });
      }

      const code = result?.data?.code;
      if (code !== "invitation_sent" && code !== "invitation_already_sent") {
        throw Object.assign(new Error("internal"), { code: "internal" });
      }

      return Object.freeze({ code });
    }
  });
}

export function createAdminInviteSubmissionFlow(service) {
  let sending = false;

  return Object.freeze({
    get sending() {
      return sending;
    },
    async submit(input) {
      if (sending) return Object.freeze({ kind: "busy" });

      const request = createArtistInvitationRequest(input);
      if (request.kind !== "valid") {
        return Object.freeze({ kind: "invalid", code: request.code });
      }

      sending = true;
      try {
        const result = await service.send(request.body);
        return Object.freeze({ kind: "success", code: result.code });
      } catch (error) {
        return Object.freeze({ kind: "error", code: safeCode(error?.code) });
      } finally {
        sending = false;
      }
    }
  });
}

export async function getAdminInviteService() {
  const runtime = await getFrontendRuntime();
  return createAdminInviteService({
    invoke: runtime.client.functions.invoke.bind(runtime.client.functions)
  });
}
