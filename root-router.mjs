import { FRONTEND_MODES } from "./auth/config.mjs";
import { getFrontendRuntime } from "./auth/supabase-client.mjs";
import { readApplicationSession } from "./auth/session.mjs";

export const ROOT_SPLASH_MINIMUM_MS = 300;
export const ROOT_DASHBOARD_DESTINATION = "dashboard.html";
export const ROOT_INTRO_DESTINATION = "intro.html";

export function resolveRootDestination(applicationSession) {
  return applicationSession?.kind === "active"
    ? ROOT_DASHBOARD_DESTINATION
    : ROOT_INTRO_DESTINATION;
}

function waitFor(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

export async function routeRoot({
  getRuntime = getFrontendRuntime,
  readSession = readApplicationSession,
  replace = (destination) => window.location.replace(destination),
  wait = waitFor,
  now = () => Date.now(),
  minimumDuration = ROOT_SPLASH_MINIMUM_MS
} = {}) {
  const startedAt = now();
  let destination = ROOT_INTRO_DESTINATION;

  try {
    const runtime = await getRuntime();

    if (runtime.mode === FRONTEND_MODES.SUPABASE) {
      destination = resolveRootDestination(await readSession(runtime.client));
    }
  } catch {
    // Root remains safely public when session resolution is unavailable.
  }

  const remainingDuration = minimumDuration - (now() - startedAt);
  if (remainingDuration > 0) await wait(remainingDuration);

  replace(destination);
  return destination;
}

if (typeof window !== "undefined") {
  void routeRoot();
}
