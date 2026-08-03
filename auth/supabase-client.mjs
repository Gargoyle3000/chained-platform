import {
  FRONTEND_MODES,
  loadFrontendConfig
} from "./config.mjs";

const SUPABASE_BROWSER_MODULE =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

let runtimePromise;
let frontendConfigPromise;

export function getFrontendConfig() {
  if (!frontendConfigPromise) frontendConfigPromise = loadFrontendConfig();
  return frontendConfigPromise;
}

export function getFrontendRuntime() {
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const config = await getFrontendConfig();
    if (config.mode === FRONTEND_MODES.PROTOTYPE) {
      return Object.freeze({ mode: FRONTEND_MODES.PROTOTYPE, config });
    }

    const { createClient } = await import(SUPABASE_BROWSER_MODULE);
    const client = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    return Object.freeze({
      mode: FRONTEND_MODES.LOCAL_SUPABASE,
      config,
      client
    });
  })();

  return runtimePromise;
}
