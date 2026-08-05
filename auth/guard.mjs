import { FRONTEND_MODES } from "./config.mjs";
import {
  DEFAULT_DASHBOARD_PAGE,
  resolveNextPage
} from "./auth-logic.mjs";
import { getFrontendRuntime } from "./supabase-client.mjs";
import { readApplicationSession } from "./session.mjs";
import { applyAuthenticatedNavigation } from "./navigation.mjs";

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

function revealProtectedContent(mode) {
  document.body.removeAttribute("data-auth-protected");
  document.body.dataset.authMode = mode;
  document.querySelector(".auth-access-state")?.remove();
  window.dispatchEvent(new CustomEvent("chained:auth-ready", {
    detail: Object.freeze({ mode })
  }));
}

function redirectToLogin() {
  window.location.replace(loginLocation());
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

  try {
    await applyAuthenticatedNavigation(client);
  } catch (error) {
    console.error("Authenticated navigation unavailable.", error);
  }
  revealProtectedContent(FRONTEND_MODES.LOCAL_SUPABASE);
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
    revealProtectedContent(FRONTEND_MODES.PROTOTYPE);
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
