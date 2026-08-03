import { FRONTEND_MODES } from "./config.mjs";
import {
  DEFAULT_DASHBOARD_PAGE,
  resolveNextPage
} from "./auth-logic.mjs";
import { getFrontendRuntime } from "./supabase-client.mjs";
import { readApplicationSession } from "./session.mjs";

const guardFlag = "__chainedAuthGuardInitialized";

function currentDestination() {
  const filename = window.location.pathname.split("/").pop() ||
    DEFAULT_DASHBOARD_PAGE;
  return resolveNextPage(`${filename}${window.location.search}`);
}

function loginLocation() {
  const parameters = new URLSearchParams({ next: currentDestination() });
  return `login.html?${parameters.toString()}`;
}

function getAccessState() {
  let state = document.querySelector(".auth-access-state");
  if (state) return state;

  state = document.createElement("section");
  state.className = "auth-access-state";
  state.setAttribute("role", "status");
  state.setAttribute("aria-live", "polite");

  const message = document.createElement("p");
  message.textContent = "CHECKING ACCESS";
  state.append(message);
  document.body.append(state);
  return state;
}

function showAccessUnavailable(message) {
  const state = getAccessState();
  const paragraph = state.querySelector("p");
  paragraph.textContent = message;
}

function revealProtectedContent() {
  document.body.removeAttribute("data-auth-protected");
  document.querySelector(".auth-access-state")?.remove();
}

function redirectToLogin() {
  window.location.replace(loginLocation());
}

function renderSessionIndicator(client) {
  if (document.querySelector(".auth-session-indicator")) return;

  const navigation = document.querySelector(".main-nav");
  if (!navigation) return;

  const indicator = document.createElement("span");
  indicator.className = "auth-session-indicator";

  const state = document.createElement("span");
  state.textContent = "SIGNED IN";

  const logout = document.createElement("button");
  logout.className = "auth-logout-button";
  logout.type = "button";
  logout.textContent = "[ LOG OUT ]";
  logout.setAttribute("aria-label", "Log out of CHAINED");

  logout.addEventListener("click", async () => {
    if (logout.disabled) return;
    logout.disabled = true;
    try {
      await client.auth.signOut();
    } finally {
      window.location.replace("login.html");
    }
  });

  indicator.append(state, logout);
  navigation.append(indicator);
}

async function authorize(client) {
  const applicationSession = await readApplicationSession(client);

  if (applicationSession.kind === "unauthenticated") {
    redirectToLogin();
    return false;
  }

  if (applicationSession.kind !== "active") {
    if (applicationSession.kind === "denied") {
      await client.auth.signOut();
    }
    showAccessUnavailable(
      "DASHBOARD ACCESS IS UNAVAILABLE FOR THIS ACCOUNT. CONTACT CHAINED SUPPORT."
    );
    return false;
  }

  renderSessionIndicator(client);
  revealProtectedContent();
  return true;
}

async function initializeGuard() {
  if (window[guardFlag]) return;
  window[guardFlag] = true;
  getAccessState();

  let runtime;
  try {
    runtime = await getFrontendRuntime();
  } catch {
    showAccessUnavailable(
      "LOCAL AUTHENTICATION CONFIGURATION IS UNAVAILABLE."
    );
    return;
  }

  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    revealProtectedContent();
    return;
  }

  const authorized = await authorize(runtime.client);
  if (!authorized) return;

  runtime.client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      redirectToLogin();
      return;
    }

    if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
      window.setTimeout(() => authorize(runtime.client), 0);
    }
  });
}

initializeGuard();

