export const DASHBOARD_ONBOARDING_VERSION = 1;

export async function readDashboardOnboardingEligibility(client) {
  try {
    const { data: userData, error: userError } = await client.auth.getUser();
    const accountId = userData?.user?.id;
    if (userError || !accountId) return { kind: "ineligible" };

    const { data: account, error: accountError } = await client
      .from("accounts")
      .select("status,onboarding_acknowledged_version")
      .eq("id", accountId)
      .maybeSingle();
    if (accountError || !account || !Number.isInteger(account.onboarding_acknowledged_version)) {
      return { kind: "unavailable" };
    }
    if (account.status !== "active" || account.onboarding_acknowledged_version >= DASHBOARD_ONBOARDING_VERSION) {
      return { kind: "ineligible" };
    }

    const { data: roles, error: roleError } = await client
      .from("account_roles")
      .select("role,revoked_at")
      .eq("account_id", accountId);
    if (roleError || !Array.isArray(roles)) return { kind: "unavailable" };
    if (!roles.some((role) => role.role === "artist" && !role.revoked_at)) {
      return { kind: "ineligible" };
    }

    const { data: memberships, error: membershipError } = await client
      .from("profile_members")
      .select("profile_id,membership_level,status,revoked_at")
      .eq("account_id", accountId)
      .eq("membership_level", "owner")
      .eq("status", "active")
      .is("revoked_at", null);
    if (membershipError || !Array.isArray(memberships)) return { kind: "unavailable" };
    const profileIds = [...new Set(memberships.map((row) => row.profile_id).filter(Boolean))];
    if (profileIds.length === 0) return { kind: "ineligible" };

    const { data: profiles, error: profileError } = await client
      .from("public_profiles")
      .select("id,profile_type,claim_state")
      .in("id", profileIds)
      .eq("profile_type", "artist")
      .eq("claim_state", "claimed");
    if (profileError || !Array.isArray(profiles)) return { kind: "unavailable" };
    return profiles.length > 0
      ? { kind: "eligible", accountId }
      : { kind: "ineligible" };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function acknowledgeDashboardOnboarding(client, accountId) {
  try {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || userData?.user?.id !== accountId) return false;
    const { data, error } = await client
      .from("accounts")
      .update({ onboarding_acknowledged_version: DASHBOARD_ONBOARDING_VERSION })
      .eq("id", accountId)
      .lt("onboarding_acknowledged_version", DASHBOARD_ONBOARDING_VERSION)
      .select("onboarding_acknowledged_version")
      .maybeSingle();
    if (error) return false;
    if (data) return data.onboarding_acknowledged_version === DASHBOARD_ONBOARDING_VERSION;

    const { data: account, error: readError } = await client
      .from("accounts")
      .select("onboarding_acknowledged_version")
      .eq("id", accountId)
      .maybeSingle();
    return !readError &&
      Number.isInteger(account?.onboarding_acknowledged_version) &&
      account.onboarding_acknowledged_version >= DASHBOARD_ONBOARDING_VERSION;
  } catch {
    return false;
  }
}
