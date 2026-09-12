import { accountAccessDecision } from "./auth-logic.mjs";

export async function readApplicationSession(client) {
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError || !sessionData?.session) {
    return Object.freeze({ kind: "unauthenticated" });
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user) {
    return Object.freeze({ kind: "unauthenticated" });
  }

  const { data: account, error: accountError } = await client
    .from("accounts")
    .select("status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (accountError) {
    return Object.freeze({ kind: "unavailable" });
  }

  const decision = accountAccessDecision(account);
  if (decision !== "active") {
    return Object.freeze({ kind: "denied", reason: decision });
  }

  return Object.freeze({
    kind: "active",
    user: userData.user,
    account
  });
}

export async function readCurrentAccountPasswordState(client) {
  let result;
  try {
    result = await client.rpc("current_account_has_password");
  } catch {
    return Object.freeze({ kind: "unavailable" });
  }

  if (result?.error || typeof result?.data !== "boolean") {
    return Object.freeze({ kind: "unavailable" });
  }

  return Object.freeze({
    kind: result.data ? "ready" : "setup-required"
  });
}

export function passwordGateDecision(passwordState) {
  if (passwordState?.kind === "ready") return "allow";
  if (passwordState?.kind === "setup-required") return "password-update";
  return "unavailable";
}
