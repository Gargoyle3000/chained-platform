import { FRONTEND_MODES } from "./config.mjs";
import {
  NEXT_PAGE_STORAGE_KEY,
  normalizeEmail,
  resolveNextPage
} from "./auth-logic.mjs";
import {
  authenticateWithPassword,
  requestMagicLink,
  requestPasswordRecovery
} from "./auth-flows.mjs";
import { getFrontendRuntime } from "./supabase-client.mjs";
import { readApplicationSession } from "./session.mjs";

const form = document.querySelector("[data-auth-login-form]");
const emailInput = document.querySelector("#auth-email");
const passwordInput = document.querySelector("#auth-password");
const passwordSubmit = document.querySelector("[data-auth-password-submit]");
const magicLinkButton = document.querySelector("[data-auth-magic-link]");
const recoveryButton = document.querySelector("[data-auth-recovery]");
const status = document.querySelector("[data-auth-status]");
const actionControls = [passwordSubmit, magicLinkButton, recoveryButton];
let busy = false;

function setStatus(message) {
  status.textContent = message;
}

function requestedNextPage() {
  const parameters = new URLSearchParams(window.location.search);
  return resolveNextPage(parameters.get("next"));
}

function setBusy(value) {
  busy = value;
  emailInput.disabled = value;
  passwordInput.disabled = value;
  actionControls.forEach((control) => {
    control.disabled = value;
  });
}

function validEmail() {
  const email = normalizeEmail(emailInput.value);
  if (email) return email;

  setStatus("ENTER A VALID EMAIL ADDRESS.");
  emailInput.focus();
  return null;
}

async function initializeLogin() {
  let runtime;
  try {
    runtime = await getFrontendRuntime();
  } catch {
    form.hidden = true;
    setStatus("AUTHENTICATION IS UNAVAILABLE.");
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
    if (busy) return;

    const email = validEmail();
    if (!email) return;

    const password = passwordInput.value;
    if (!password) {
      setStatus("ENTER YOUR PASSWORD.");
      passwordInput.focus();
      return;
    }

    setBusy(true);
    setStatus("CHECKING ACCESS");

    try {
      const result = await authenticateWithPassword(runtime.client, {
        email,
        password
      });

      if (result.kind === "active") {
        passwordInput.value = "";
        window.location.replace(requestedNextPage());
        return;
      }

      setStatus(result.message);
    } catch {
      setStatus("SIGN-IN IS TEMPORARILY UNAVAILABLE. TRY AGAIN LATER.");
    } finally {
      setBusy(false);
    }
  });

  magicLinkButton.addEventListener("click", async () => {
    if (busy) return;
    const email = validEmail();
    if (!email) return;

    setBusy(true);
    setStatus("REQUESTING SIGN-IN LINK");

    try {
      sessionStorage.setItem(NEXT_PAGE_STORAGE_KEY, requestedNextPage());
      const result = await requestMagicLink(runtime.client, {
        email,
        callbackUrl: runtime.config.callbackUrl
      });
      setStatus(result.message);
    } finally {
      setBusy(false);
    }
  });

  recoveryButton.addEventListener("click", async () => {
    if (busy) return;
    const email = validEmail();
    if (!email) return;

    setBusy(true);
    setStatus("REQUESTING PASSWORD RESET");

    try {
      const result = await requestPasswordRecovery(runtime.client, {
        email,
        passwordUpdateUrl: runtime.config.passwordUpdateUrl
      });
      setStatus(result.message);
    } finally {
      setBusy(false);
    }
  });

  form.hidden = false;
}

initializeLogin();
