import { FRONTEND_MODES } from "./config.mjs";
import {
  mapLoginResult,
  NEXT_PAGE_STORAGE_KEY,
  normalizeEmail,
  resolveNextPage
} from "./auth-logic.mjs";
import { getFrontendRuntime } from "./supabase-client.mjs";
import { readApplicationSession } from "./session.mjs";

const form = document.querySelector("[data-auth-login-form]");
const emailInput = document.querySelector("#auth-email");
const submitButton = document.querySelector("[data-auth-submit]");
const status = document.querySelector("[data-auth-status]");

function setStatus(message) {
  status.textContent = message;
}

function requestedNextPage() {
  const parameters = new URLSearchParams(window.location.search);
  return resolveNextPage(parameters.get("next"));
}

async function initializeLogin() {
  let runtime;
  try {
    runtime = await getFrontendRuntime();
  } catch {
    form.hidden = true;
    setStatus("LOCAL AUTHENTICATION CONFIGURATION IS UNAVAILABLE.");
    return;
  }

  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    form.hidden = true;
    setStatus("SIGN-IN IS AVAILABLE ONLY IN THE LOCAL SUPABASE ENVIRONMENT.");
    return;
  }

  const existing = await readApplicationSession(runtime.client);
  if (existing.kind === "active") {
    window.location.replace(requestedNextPage());
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;

    const email = normalizeEmail(emailInput.value);
    if (!email) {
      setStatus("ENTER A VALID EMAIL ADDRESS.");
      emailInput.focus();
      return;
    }

    submitButton.disabled = true;
    emailInput.disabled = true;
    setStatus("REQUESTING SIGN-IN LINK");

    try {
      sessionStorage.setItem(NEXT_PAGE_STORAGE_KEY, requestedNextPage());
      const result = await runtime.client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: runtime.config.callbackUrl
        }
      });
      const mapped = mapLoginResult(result);
      setStatus(mapped.message);
      emailInput.value = "";
    } catch {
      setStatus("SIGN-IN IS TEMPORARILY UNAVAILABLE. TRY AGAIN LATER.");
    } finally {
      submitButton.disabled = false;
      emailInput.disabled = false;
    }
  });
}

initializeLogin();

