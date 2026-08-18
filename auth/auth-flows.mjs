import {
  GENERIC_AUTH_FAILURE,
  GENERIC_RECOVERY_CONFIRMATION,
  mapLoginResult
} from "./auth-logic.mjs";
import { readApplicationSession } from "./session.mjs";

async function signOutQuietly(client) {
  try {
    await client.auth.signOut();
  } catch {
    // Access is already denied; logout failure must not expose Auth details.
  }
}

export async function authenticateWithPassword(
  client,
  { email, password },
  readSession = readApplicationSession
) {
  let result;
  try {
    result = await client.auth.signInWithPassword({ email, password });
  } catch {
    return Object.freeze({ kind: "unavailable", message: GENERIC_AUTH_FAILURE });
  }

  if (result?.error || !result?.data?.user) {
    return Object.freeze({ kind: "invalid", message: GENERIC_AUTH_FAILURE });
  }

  let applicationSession;
  try {
    applicationSession = await readSession(client);
  } catch {
    await signOutQuietly(client);
    return Object.freeze({
      kind: "unavailable",
      message: GENERIC_AUTH_FAILURE
    });
  }
  if (
    applicationSession.kind === "active" &&
    applicationSession.user.id === result.data.user.id
  ) {
    return Object.freeze({
      kind: "active",
      userId: applicationSession.user.id
    });
  }

  await signOutQuietly(client);
  return Object.freeze({
    kind: applicationSession.kind === "unavailable" ? "unavailable" : "denied",
    message: GENERIC_AUTH_FAILURE
  });
}

export async function requestMagicLink(client, { email, callbackUrl }) {
  try {
    await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: callbackUrl
      }
    });
  } catch {
    // A generic result prevents account and delivery-state enumeration.
  }

  return mapLoginResult();
}

export async function requestPasswordRecovery(
  client,
  { email, passwordUpdateUrl }
) {
  try {
    await client.auth.resetPasswordForEmail(email, {
      redirectTo: passwordUpdateUrl
    });
  } catch {
    // A generic result prevents account and delivery-state enumeration.
  }

  return Object.freeze({
    kind: "generic-success",
    message: GENERIC_RECOVERY_CONFIRMATION
  });
}

export async function establishPasswordLinkSession(
  client,
  { code, hasAuthParameters },
  readSession = readApplicationSession
) {
  if (!hasAuthParameters) {
    return Object.freeze({ kind: "invalid" });
  }

  if (code) {
    try {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) return Object.freeze({ kind: "invalid" });
    } catch {
      return Object.freeze({ kind: "invalid" });
    }
  }

  let applicationSession;
  try {
    applicationSession = await readSession(client);
  } catch {
    await signOutQuietly(client);
    return Object.freeze({ kind: "unavailable" });
  }
  if (applicationSession.kind === "active") {
    return Object.freeze({
      kind: "active",
      userId: applicationSession.user.id
    });
  }

  if (applicationSession.kind === "denied") {
    await signOutQuietly(client);
  }

  return Object.freeze({ kind: applicationSession.kind });
}

export async function updateSameUserPassword(client, { password, userId }) {
  let result;
  try {
    result = await client.auth.updateUser({ password });
  } catch {
    return Object.freeze({ kind: "failed" });
  }

  if (result?.error || !result?.data?.user) {
    return Object.freeze({ kind: "failed" });
  }

  if (result.data.user.id !== userId) {
    await signOutQuietly(client);
    return Object.freeze({ kind: "identity-mismatch" });
  }

  return Object.freeze({ kind: "updated", userId });
}
