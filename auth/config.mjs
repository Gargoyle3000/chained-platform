const LOCAL_CONFIG_URL = new URL("../frontend-config.local.mjs", import.meta.url);
const PRODUCTION_CONFIG_URL = new URL("../frontend-config.production.mjs", import.meta.url);

export const FRONTEND_MODES = Object.freeze({
  PROTOTYPE: "prototype",
  SUPABASE: "supabase"
});

export const FRONTEND_TARGETS = Object.freeze({
  LOCAL: "local",
  PRODUCTION: "production"
});

export const LOCAL_CALLBACK_URL =
  "http://127.0.0.1:5500/auth-callback.html";

export const LOCAL_PASSWORD_UPDATE_URL =
  "http://127.0.0.1:5500/password-update.html";

export const PRODUCTION_SITE_ORIGIN =
  "https://chained.work";

export const PRODUCTION_CALLBACK_URL =
  "https://chained.work/auth-callback.html";

export const PRODUCTION_PASSWORD_UPDATE_URL =
  "https://chained.work/password-update.html";

export const PRODUCTION_SUPABASE_URL =
  "https://jjtobvxjmbnybbxlvnxs.supabase.co";

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
  if (!key || /placeholder|your[-_]|<|>/i.test(key)) return false;

  if (/^sb_secret_/i.test(key) || /service[-_]?role/i.test(key)) {
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

function normalizeProductionSupabaseUrl(value) {
  if (typeof value !== "string") {
    throw new Error("Production Supabase URL is required.");
  }

  let url;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Production Supabase URL is invalid.");
  }

  if (
    url.protocol !== "https:" ||
    url.origin !== PRODUCTION_SUPABASE_URL ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Only the CHAINED production Supabase API URL is accepted.");
  }

  return url.origin;
}

export function isSupabaseMode(mode) {
  return mode === FRONTEND_MODES.SUPABASE;
}

export function resolveFrontendTarget(location = globalThis.location) {
  const hostname = String(location?.hostname ?? "")
    .trim()
    .toLowerCase();

  if (["127.0.0.1", "localhost"].includes(hostname)) {
    return FRONTEND_TARGETS.LOCAL;
  }

  if (hostname === "chained.work") {
    return FRONTEND_TARGETS.PRODUCTION;
  }

  return null;
}

export function validateFrontendConfig(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("Frontend configuration is invalid.");
  }

  if (candidate.mode === FRONTEND_MODES.PROTOTYPE) {
    return PROTOTYPE_CONFIG;
  }

  if (candidate.mode !== FRONTEND_MODES.SUPABASE) {
    throw new Error("Frontend mode is invalid.");
  }

  const target = String(candidate.target ?? "").trim();

  let supabaseUrl;
  let callbackUrl;
  let passwordUpdateUrl;

  if (target === FRONTEND_TARGETS.LOCAL) {
    supabaseUrl = normalizeLocalSupabaseUrl(candidate.supabaseUrl);

    if (candidate.callbackUrl !== LOCAL_CALLBACK_URL) {
      throw new Error("The local Auth callback URL is invalid.");
    }

    callbackUrl = LOCAL_CALLBACK_URL;
    passwordUpdateUrl = LOCAL_PASSWORD_UPDATE_URL;
  } else if (target === FRONTEND_TARGETS.PRODUCTION) {
    supabaseUrl = normalizeProductionSupabaseUrl(candidate.supabaseUrl);

    if (candidate.callbackUrl !== PRODUCTION_CALLBACK_URL) {
      throw new Error("The production Auth callback URL is invalid.");
    }

    callbackUrl = PRODUCTION_CALLBACK_URL;
    passwordUpdateUrl = PRODUCTION_PASSWORD_UPDATE_URL;
  } else {
    throw new Error("Frontend target is invalid.");
  }

  const supabaseKey = String(candidate.supabaseKey ?? "").trim();

  if (!isBrowserSafeSupabaseKey(supabaseKey)) {
    throw new Error(
      "A browser-safe Supabase publishable or anon key is required."
    );
  }

  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,
    target,
    supabaseUrl,
    supabaseKey,
    callbackUrl,
    passwordUpdateUrl
  });
}

export async function loadFrontendConfig({
  probe,
  importer,
  location = globalThis.location
} = {}) {
  const target = resolveFrontendTarget(location);

  if (!target) {
    return PROTOTYPE_CONFIG;
  }

  const configUrl =
    target === FRONTEND_TARGETS.PRODUCTION
      ? PRODUCTION_CONFIG_URL
      : LOCAL_CONFIG_URL;

  const probeConfig = probe ?? ((url) => fetch(url, {
    method: "HEAD",
    cache: "no-store",
    credentials: "same-origin"
  }));

  const importConfig = importer ?? ((url) => import(url.href));

  let response;

  try {
    response = await probeConfig(configUrl);
  } catch {
    throw new Error("Frontend configuration could not be checked.");
  }

  if (response?.status === 404) {
    if (target === FRONTEND_TARGETS.LOCAL) {
      return PROTOTYPE_CONFIG;
    }

    throw new Error("Production frontend configuration is unavailable.");
  }

  if (!response?.ok) {
    throw new Error("Frontend configuration could not be loaded.");
  }

  const module = await importConfig(configUrl);
  const config = validateFrontendConfig(module?.default);

  if (config.target !== target) {
    throw new Error("Frontend configuration target does not match the current site.");
  }

  return config;
}
