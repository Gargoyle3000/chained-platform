import { FRONTEND_MODES } from "./auth/config.mjs";
import { getFrontendRuntime } from "./auth/supabase-client.mjs";
import { readApplicationSession } from "./auth/session.mjs";

export function resolveAboutDestination(applicationSession) {
  return applicationSession?.kind === "active" ? "dashboard.html" : null;
}

async function redirectActiveAccountFromAbout() {
  try {
    const runtime = await getFrontendRuntime();
    if (runtime.mode === FRONTEND_MODES.PROTOTYPE) return;

    const applicationSession = await readApplicationSession(runtime.client);
    const destination = resolveAboutDestination(applicationSession);
    if (destination) window.location.replace(destination);
  } catch {
    // The public explanation remains available when session resolution is unavailable.
  }
}

redirectActiveAccountFromAbout();
