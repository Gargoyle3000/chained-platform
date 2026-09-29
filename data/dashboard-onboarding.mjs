import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import {
  acknowledgeDashboardOnboarding,
  readDashboardOnboardingEligibility
} from "./dashboard-onboarding-repository.mjs";

export const ONBOARDING_STEPS = Object.freeze([
  ["PUBLIC / PRIVATE", "Visitors see published public material. Your Workspace and management tools stay private."],
  ["PROFILE / WORKSPACE", "PROFILE is your public-facing Artist identity. The interactive global [+] opens your private Artist Workspace."],
  ["WORKS / PUBLICATION", "Save a Work before choosing to publish it. Work and Profile publication are separate; a published Work under a draft Profile is not publicly reachable."],
  ["PRESENTATIONS / AGENDA", "Presentations give existing Works context without taking ownership of them. Agenda shows time-bound activity."],
  ["DISCOVER / FOLLOW", "DISCOVER explores the wider CHAINED network. FOLLOW shows activity from the Artists and Profiles you follow."],
  ["SELECTOR / PROJECTS", "SELECTOR is your private place to collect and organize Works with Tags. Projects order selected Works for a CHAINED SELECT output."],
  ["HELP / START", "The contextual [ ? ] on relevant pages remains available when you need a reminder. You can start with whichever part of CHAINED is useful now."]
]);

export function mountDashboardOnboarding({
  pageWindow = window,
  pageDocument = document,
  getRuntime = getFrontendRuntime,
  readEligibility = readDashboardOnboardingEligibility,
  acknowledge = acknowledgeDashboardOnboarding
} = {}) {
  const dialog = pageDocument.getElementById("dashboard-onboarding-dialog");
  if (!dialog) return null;

  const heading = dialog.querySelector("[data-onboarding-heading]");
  const copy = dialog.querySelector("[data-onboarding-copy]");
  const progress = dialog.querySelector("[data-onboarding-progress]");
  const feedback = dialog.querySelector("[data-onboarding-feedback]");
  const back = dialog.querySelector("[data-onboarding-back]");
  const next = dialog.querySelector("[data-onboarding-next]");
  const finish = dialog.querySelector("[data-onboarding-finish]");
  const skip = dialog.querySelector("[data-onboarding-skip]");
  const retry = dialog.querySelector("[data-onboarding-retry]");
  const dismiss = dialog.querySelector("[data-onboarding-dismiss]");
  let step = 0;
  let checking = false;
  let writing = false;
  let completed = false;
  let dismissed = false;
  let accountId = null;
  let client = null;
  let priorFocus = null;

  function render({ focus = false } = {}) {
    const [title, description] = ONBOARDING_STEPS[step];
    progress.textContent = `${step + 1} / ${ONBOARDING_STEPS.length}`;
    heading.textContent = title;
    copy.textContent = description;
    back.disabled = step === 0 || writing;
    next.hidden = step === ONBOARDING_STEPS.length - 1;
    finish.hidden = !next.hidden;
    if (focus) heading.focus({ preventScroll: true });
  }

  function close() {
    dialog.close();
    const target = priorFocus?.isConnected && priorFocus !== pageDocument.body
      ? priorFocus
      : pageDocument.querySelector(".dashboard-navigation a") || pageDocument.querySelector(".dashboard-link");
    target?.focus({ preventScroll: true });
  }

  function setWriting(value) {
    writing = value;
    for (const button of [back, next, finish, skip, retry, dismiss]) button.disabled = value;
  }

  async function persistAcknowledgement() {
    if (writing || completed || dismissed) return;
    setWriting(true);
    feedback.hidden = true;
    let saved = false;
    try {
      saved = await acknowledge(client, accountId);
    } catch {
      saved = false;
    }
    setWriting(false);
    back.disabled = step === 0;
    if (saved) {
      completed = true;
      close();
      return;
    }
    feedback.textContent = "COULD NOT SAVE YOUR CHOICE. RETRY OR CONTINUE FOR NOW.";
    feedback.hidden = false;
    retry.hidden = false;
    dismiss.hidden = false;
    retry.focus({ preventScroll: true });
  }

  back.addEventListener("click", () => {
    if (writing || step === 0) return;
    step -= 1;
    render({ focus: true });
  });
  next.addEventListener("click", () => {
    if (writing || step === ONBOARDING_STEPS.length - 1) return;
    step += 1;
    render({ focus: true });
  });
  for (const button of [skip, finish, retry]) {
    button.addEventListener("click", persistAcknowledgement);
  }
  dismiss.addEventListener("click", () => {
    if (writing) return;
    dismissed = true;
    close();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    return persistAcknowledgement();
  });

  async function onReady(event) {
    if (event?.detail?.mode && event.detail.mode !== FRONTEND_MODES.SUPABASE) return;
    if (pageDocument.body.dataset.authMode !== FRONTEND_MODES.SUPABASE ||
        checking || writing || completed || dismissed || dialog.open) return;
    checking = true;
    try {
      const runtime = await getRuntime();
      if (runtime?.mode !== FRONTEND_MODES.SUPABASE || !runtime.client) return;
      const eligibility = await readEligibility(runtime.client);
      if (eligibility.kind !== "eligible" || pageDocument.body.dataset.authMode !== FRONTEND_MODES.SUPABASE) return;
      client = runtime.client;
      accountId = eligibility.accountId;
      step = 0;
      feedback.hidden = true;
      retry.hidden = true;
      dismiss.hidden = true;
      render();
      priorFocus = pageDocument.activeElement;
      dialog.showModal();
      heading.focus({ preventScroll: true });
    } catch {
      // The Dashboard remains usable if onboarding state or dialog support is unavailable.
    } finally {
      checking = false;
    }
  }

  pageWindow.addEventListener("chained:auth-ready", onReady);
  const ready = pageDocument.body.dataset.authMode === FRONTEND_MODES.SUPABASE
    ? onReady()
    : Promise.resolve();
  return { onReady, ready };
}

if (typeof document !== "undefined") mountDashboardOnboarding();
