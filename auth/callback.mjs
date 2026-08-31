import { FRONTEND_MODES } from "./config.mjs";
import {
  DEFAULT_DASHBOARD_PAGE,
  NEXT_PAGE_STORAGE_KEY,
  resolveNextPage,
  sanitizeCallbackError
} from "./auth-logic.mjs";
import { getFrontendRuntime } from "./supabase-client.mjs";
import { readApplicationSession } from "./session.mjs";

const heading = document.querySelector("[data-callback-heading]");
const status = document.querySelector("[data-callback-status]");
let callbackStarted = false;

function setState(title, message) {
  heading.textContent = title;
  status.textContent = message;
}

function cleanCallbackLocation() {
  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );
}

function consumeNextPage() {
  const stored = sessionStorage.getItem(NEXT_PAGE_STORAGE_KEY);
  sessionStorage.removeItem(NEXT_PAGE_STORAGE_KEY);
  return resolveNextPage(stored || DEFAULT_DASHBOARD_PAGE);
}

async function initializeCallback() {
  if (callbackStarted) return;
  callbackStarted = true;

  let runtime;
  try {
    runtime = await getFrontendRuntime();
  } catch {
    cleanCallbackLocation();
    setState("ACCESS UNAVAILABLE", "AUTHENTICATION IS CURRENTLY UNAVAILABLE.");
    return;
  }

  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    cleanCallbackLocation();
    setState("ACCESS UNAVAILABLE", "SIGN-IN IS UNAVAILABLE IN THIS ENVIRONMENT.");
    return;
  }

  const parameters = new URLSearchParams(window.location.search);
  const callbackError = parameters.get("error_description") ||
    parameters.get("error");
  const code = parameters.get("code");

  if (callbackError) {
    cleanCallbackLocation();
    setState("SIGN-IN NOT COMPLETED", sanitizeCallbackError(callbackError));
    return;
  }

  try {
    if (code) {
      const { error } = await runtime.client.auth.exchangeCodeForSession(code);
      if (error) throw new Error("callback_exchange_failed");
    }

    const applicationSession = await readApplicationSession(runtime.client);
    cleanCallbackLocation();

    if (applicationSession.kind === "active") {
      window.location.replace(consumeNextPage());
      return;
    }

    if (applicationSession.kind === "denied") {
      await runtime.client.auth.signOut();
      setState(
        "ACCESS UNAVAILABLE",
        "THIS CHAINED ACCOUNT IS NOT AVAILABLE. CONTACT CHAINED SUPPORT."
      );
      return;
    }

    setState(
      "SIGN-IN NOT COMPLETED",
      "THE SIGN-IN LINK IS INVALID OR HAS ALREADY BEEN USED."
    );
  } catch {
    cleanCallbackLocation();
    setState(
      "SIGN-IN NOT COMPLETED",
      "THE SIGN-IN LINK COULD NOT BE COMPLETED. REQUEST A NEW LINK."
    );
  }
}

initializeCallback();
