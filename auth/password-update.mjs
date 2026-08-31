import { FRONTEND_MODES } from "./config.mjs";
import {
  readAuthLinkInput,
  validateNewPassword
} from "./auth-logic.mjs";
import {
  establishPasswordLinkSession,
  updateSameUserPassword
} from "./auth-flows.mjs";
import { getFrontendRuntime } from "./supabase-client.mjs";

const form = document.querySelector("[data-password-update-form]");
const passwordInput = document.querySelector("#new-password");
const confirmationInput = document.querySelector("#confirm-password");
const submitButton = document.querySelector("[data-password-update-submit]");
const status = document.querySelector("[data-password-update-status]");
let activeUserId = null;
let busy = false;

function setStatus(message) {
  status.textContent = message;
}

function cleanLocation() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

function setBusy(value) {
  busy = value;
  passwordInput.disabled = value;
  confirmationInput.disabled = value;
  submitButton.disabled = value;
}

async function initializePasswordUpdate() {
  const linkInput = readAuthLinkInput(
    window.location.search,
    window.location.hash
  );

  if (linkInput.errorMessage) {
    cleanLocation();
    setStatus(linkInput.errorMessage);
    return;
  }

  let runtime;
  try {
    runtime = await getFrontendRuntime();
  } catch {
    cleanLocation();
    setStatus("AUTHENTICATION IS CURRENTLY UNAVAILABLE.");
    return;
  }

  if (runtime.mode === FRONTEND_MODES.PROTOTYPE) {
    cleanLocation();
    setStatus("PASSWORD SETUP IS CURRENTLY UNAVAILABLE.");
    return;
  }

  let session;
  try {
    session = await establishPasswordLinkSession(runtime.client, linkInput);
  } catch {
    cleanLocation();
    setStatus("THIS PASSWORD LINK COULD NOT BE VERIFIED. REQUEST A NEW LINK.");
    return;
  }
  cleanLocation();

  if (session.kind !== "active") {
    setStatus(
      session.kind === "denied"
        ? "THIS CHAINED ACCOUNT IS NOT AVAILABLE. CONTACT CHAINED SUPPORT."
        : "THIS PASSWORD LINK IS INVALID OR HAS EXPIRED. REQUEST A NEW LINK."
    );
    return;
  }

  activeUserId = session.userId;
  form.hidden = false;
  setStatus("");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !activeUserId) return;

    const password = passwordInput.value;
    const validation = validateNewPassword(
      password,
      confirmationInput.value
    );

    if (!validation.valid) {
      setStatus(validation.message);
      (password.length < 8 ? passwordInput : confirmationInput).focus();
      return;
    }

    setBusy(true);
    setStatus("SETTING PASSWORD");

    const result = await updateSameUserPassword(runtime.client, {
      password,
      userId: activeUserId
    });

    passwordInput.value = "";
    confirmationInput.value = "";

    if (result.kind === "updated") {
      window.location.replace("dashboard.html");
      return;
    }

    setStatus("PASSWORD COULD NOT BE SET. REQUEST A NEW LINK AND TRY AGAIN.");
    setBusy(false);
  });
}

initializePasswordUpdate();
