const LOCAL_CONFIG_URL = new URL("../frontend-config.local.mjs", import.meta.url);

export const FRONTEND_MODES = Object.freeze({
  PROTOTYPE: "prototype",
  LOCAL_SUPABASE: "local-supabase"
});

export const LOCAL_CALLBACK_URL =
  "http://127.0.0.1:5500/auth-callback.html";

const PROTOTYPE_CONFIG = Object.freeze({
  mode: FRONTEND_MODES.PROTOTYPE
});

function decodeJwtPayload(value) {
  const segments = value.split(".");
  if (segments.length !== 3) return null;

  try {
    const base64 = segments[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(segments[1].length / 4) * 4, "=");
    return JSON.parse(globalThis.atob(base64));
  } catch {
    return null;
  }
}

export function isBrowserSafeSupabaseKey(value) {
  if (typeof value !== "string") return false;

  const key = value.trim();
  if (!key || /placeholder|your[_-]|<|>/i.test(key)) return false;
  if (/^sb_secret_/i.test(key) || /service[_-]?role/i.test(key)) {
    return false;
  }

  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;

  const payload = decodeJwtPayload(key);
  return payload?.role === "anon";
}

function normalizeLocalSupabaseUrl(value) {
  if (typeof value !== "string") {
    throw new Error("Local Supabase URL is required.");
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Local Supabase URL is invalid.");
  }

  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !url.port
  ) {
    throw new Error("Only a local Supabase API URL is accepted.");
  }

  return url.origin;
}

export function validateFrontendConfig(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Frontend configuration is invalid.");
  }

  if (candidate.mode === FRONTEND_MODES.PROTOTYPE) {
    return PROTOTYPE_CONFIG;
  }

  if (candidate.mode !== FRONTEND_MODES.LOCAL_SUPABASE) {
    throw new Error("Frontend mode is invalid.");
  }

  const supabaseUrl = normalizeLocalSupabaseUrl(candidate.supabaseUrl);
  const supabaseKey = String(candidate.supabaseKey ?? "").trim();
  if (!isBrowserSafeSupabaseKey(supabaseKey)) {
    throw new Error("A browser-safe Supabase publishable or anon key is required.");
  }

  if (candidate.callbackUrl !== LOCAL_CALLBACK_URL) {
    throw new Error("The local Auth callback URL is invalid.");
  }

  return Object.freeze({
    mode: FRONTEND_MODES.LOCAL_SUPABASE,
    supabaseUrl,
    supabaseKey,
    callbackUrl: LOCAL_CALLBACK_URL
  });
}

export async function loadFrontendConfig({ probe, importer } = {}) {
  const probeConfig = probe ?? ((url) => fetch(url, {
    method: "HEAD",
    cache: "no-store",
    credentials: "same-origin"
  }));
  const importConfig = importer ?? ((url) => import(url.href));

  let response;
  try {
    response = await probeConfig(LOCAL_CONFIG_URL);
  } catch {
    throw new Error("Frontend configuration could not be checked.");
  }

  if (response?.status === 404) return PROTOTYPE_CONFIG;
  if (!response?.ok) {
    throw new Error("Frontend configuration could not be loaded.");
  }

  const module = await importConfig(LOCAL_CONFIG_URL);
  return validateFrontendConfig(module?.default);
}

