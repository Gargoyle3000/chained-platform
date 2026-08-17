export type EnvironmentReader = (name: string) => string | undefined;

export type SupabaseApiKey = Readonly<{
  value: string;
  kind: "current" | "legacy";
}>;

export type SupabaseApiKeys = Readonly<{
  publishable: SupabaseApiKey;
  secret: SupabaseApiKey;
}>;

function trimmed(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate ? candidate : null;
}

function dictionaryKey(
  readEnvironment: EnvironmentReader,
  environmentName: string,
  keyName: string,
): string | null {
  const raw = trimmed(readEnvironment(environmentName));
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${environmentName} is invalid.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${environmentName} is invalid.`);
  }

  const dictionary = parsed as Record<string, unknown>;
  if (!(keyName in dictionary)) return null;

  const value = dictionary[keyName];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${environmentName} does not contain a valid ${keyName} key.`);
  }

  return value.trim();
}

function currentOrLegacyKey(
  readEnvironment: EnvironmentReader,
  dictionaryEnvironment: string,
  singularEnvironment: string,
  legacyEnvironment: string,
  keyName: string,
): SupabaseApiKey {
  const dictionaryValue = dictionaryKey(
    readEnvironment,
    dictionaryEnvironment,
    keyName,
  );
  if (dictionaryValue) {
    return Object.freeze({ value: dictionaryValue, kind: "current" });
  }

  const singularValue = trimmed(readEnvironment(singularEnvironment));
  if (singularValue) {
    return Object.freeze({ value: singularValue, kind: "current" });
  }

  const legacyValue = trimmed(readEnvironment(legacyEnvironment));
  if (legacyValue) {
    return Object.freeze({ value: legacyValue, kind: "legacy" });
  }

  throw new Error(`Supabase API key configuration is incomplete for ${keyName}.`);
}

export function resolveSupabaseApiKeys(
  readEnvironment: EnvironmentReader,
  keyName = "default",
): SupabaseApiKeys {
  return Object.freeze({
    publishable: currentOrLegacyKey(
      readEnvironment,
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      keyName,
    ),
    secret: currentOrLegacyKey(
      readEnvironment,
      "SUPABASE_SECRET_KEYS",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      keyName,
    ),
  });
}

export function userScopedHeaders(
  publishableKey: SupabaseApiKey,
  authorization: string,
  extra: HeadersInit = {},
): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", publishableKey.value);
  headers.set("authorization", authorization);
  return headers;
}

export function elevatedServiceHeaders(
  secretKey: SupabaseApiKey,
  extra: HeadersInit = {},
): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", secretKey.value);
  headers.delete("authorization");

  if (secretKey.kind === "legacy") {
    headers.set("authorization", `Bearer ${secretKey.value}`);
  }

  return headers;
}
