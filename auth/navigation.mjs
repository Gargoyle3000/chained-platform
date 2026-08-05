import { resolveManagedProfileState } from "../data/work-mapping.mjs";
import { createPublicProfileLink } from "../data/public-work-mapping.mjs";

const DASHBOARD_HREF = "dashboard.html";

function uniqueProfileIds(memberships) {
  return [...new Set(
    (Array.isArray(memberships) ? memberships : [])
      .map((membership) => membership?.profile_id)
      .filter(Boolean)
  )];
}

export async function readManagedProfiles(client) {
  const { data: memberships, error: membershipError } = await client
    .from("profile_members")
    .select("profile_id,membership_level,status,revoked_at")
    .eq("status", "active")
    .is("revoked_at", null)
    .order("profile_id", { ascending: true });

  if (membershipError) throw membershipError;

  const profileIds = uniqueProfileIds(memberships);
  if (profileIds.length === 0) return [];

  const { data: profiles, error: profileError } = await client
    .from("public_profiles")
    .select("id,slug,display_name,profile_type,publication_status")
    .in("id", profileIds)
    .order("display_name", { ascending: true })
    .order("id", { ascending: true });

  if (profileError) throw profileError;

  return Array.isArray(profiles) ? profiles : [];
}

export function resolveOwnProfileNavigation(profiles) {
  const state = resolveManagedProfileState(profiles);

  if (
    state.kind === "one" &&
    state.selected?.slug &&
    state.selected.publication_status === "published"
  ) {
    return Object.freeze({
      kind: "profile",
      href: createPublicProfileLink(state.selected.slug),
      profile: state.selected
    });
  }

  return Object.freeze({
    kind: state.kind,
    href: DASHBOARD_HREF,
    profile: null
  });
}

function ensureHeaderActions(header, navigation) {
  let actions = header.querySelector(".header-actions");

  if (!actions) {
    actions = document.createElement("div");
    actions.className = "header-actions";
    navigation.before(actions);
    actions.append(navigation);
  } else if (navigation.parentElement !== actions) {
    actions.append(navigation);
  }

  return actions;
}

function ensureProfileGroup(navigation) {
  const profileLink = navigation.querySelector("[data-own-profile-link]");
  if (!profileLink) return null;

  let group = profileLink.closest(".profile-nav-group");

  if (!group) {
    group = document.createElement("span");
    group.className = "profile-nav-group";
    profileLink.before(group);
    group.append(profileLink);
  }

  let dashboardLink = group.querySelector(".dashboard-link");

  if (!dashboardLink) {
    dashboardLink = document.createElement("a");
    dashboardLink.className = "dashboard-link";
    dashboardLink.href = DASHBOARD_HREF;
    dashboardLink.textContent = "+";
    dashboardLink.setAttribute("aria-label", "Open dashboard");
    group.append(dashboardLink);
  }

  return group;
}

function ensureSessionIndicator(actions, client) {
  let indicator = actions.querySelector(".auth-session-indicator");

  if (!indicator) {
    indicator = document.createElement("div");
    indicator.className = "auth-session-indicator";

    const state = document.createElement("span");
    state.textContent = "SIGNED IN";

    const logout = document.createElement("button");
    logout.className = "auth-logout-button";
    logout.type = "button";
    logout.textContent = "[ LOG OUT ]";
    logout.setAttribute("aria-label", "Log out of CHAINED");

    indicator.append(state, logout);
    actions.append(indicator);
  }

  const logout = indicator.querySelector(".auth-logout-button");

  if (logout && logout.dataset.logoutReady !== "true") {
    logout.dataset.logoutReady = "true";

    logout.addEventListener("click", async () => {
      if (logout.disabled) return;

      logout.disabled = true;

      try {
        await client.auth.signOut();
      } finally {
        window.location.replace("login.html");
      }
    });
  }

  return indicator;
}

export async function applyAuthenticatedNavigation(client) {
  const header = document.querySelector(".site-header");
  const navigation = header?.querySelector(".main-nav");

  if (!header || !navigation) {
    return Object.freeze({ kind: "missing-header", href: DASHBOARD_HREF });
  }

  const profiles = await readManagedProfiles(client);
  const destination = resolveOwnProfileNavigation(profiles);

  document.querySelectorAll("[data-own-profile-link]").forEach((link) => {
    link.href = destination.href;
  });

  navigation.classList.add("main-nav-with-dashboard");

  const actions = ensureHeaderActions(header, navigation);
  ensureProfileGroup(navigation);
  ensureSessionIndicator(actions, client);

  header.dataset.authNavigationReady = "true";

  return destination;
}
