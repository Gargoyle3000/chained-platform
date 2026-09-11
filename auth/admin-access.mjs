function hasActiveAdminRole(rows) {
  return Array.isArray(rows) && rows.some((row) => (
    row?.role === "admin" && !row?.revoked_at
  ));
}

export async function readAdminAccess(client) {
  let userResult;
  try {
    userResult = await client.auth.getUser();
  } catch {
    return Object.freeze({ kind: "unavailable" });
  }
  const user = userResult?.data?.user;

  if (userResult?.error || !user) {
    return Object.freeze({ kind: "unauthenticated" });
  }

  let accountResult;
  let rolesResult;
  try {
    [accountResult, rolesResult] = await Promise.all([
      client
        .from("accounts")
        .select("status")
        .eq("id", user.id)
        .maybeSingle(),
      client
        .from("account_roles")
        .select("role,revoked_at")
        .eq("account_id", user.id)
    ]);
  } catch {
    return Object.freeze({ kind: "unavailable" });
  }

  if (accountResult?.error || rolesResult?.error) {
    return Object.freeze({ kind: "unavailable" });
  }

  if (accountResult?.data?.status !== "active") {
    return Object.freeze({ kind: "account_inactive" });
  }

  return Object.freeze({
    kind: hasActiveAdminRole(rolesResult?.data) ? "admin" : "admin_required"
  });
}
