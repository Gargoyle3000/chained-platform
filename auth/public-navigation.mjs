import { FRONTEND_MODES } from "./config.mjs";
import { getFrontendRuntime } from "./supabase-client.mjs";
import { readApplicationSession } from "./session.mjs";
import { applyAuthenticatedNavigation } from "./navigation.mjs";

async function initializePublicNavigation() {
  try {
    const runtime = await getFrontendRuntime();

    if (runtime.mode === FRONTEND_MODES.PROTOTYPE) return;

    const applicationSession = await readApplicationSession(runtime.client);

    if (applicationSession.kind !== "active") return;

    await applyAuthenticatedNavigation(runtime.client);
  } catch (error) {
    console.error("Public authenticated navigation unavailable.", error);
  }
}

initializePublicNavigation();
