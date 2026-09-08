import { createCvImportHandler } from "./logic.ts";
import { extractCvImportWithOpenAi } from "./provider.ts";
import {
  resolveSupabaseApiKeys,
  userScopedHeaders
} from "../_shared/supabase-api-keys.ts";

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment: ${name}`);
  return value;
}

function configuredUuidSet(name: string): ReadonlySet<string> {
  const values = (Deno.env.get(name) ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (values.some((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))) {
    throw new Error(`${name} is invalid`);
  }
  return new Set(values);
}

const supabaseUrl = requiredEnvironment("SUPABASE_URL").replace(/\/$/, "");
const apiKeys = resolveSupabaseApiKeys((name) => Deno.env.get(name));
const openAiApiKey = requiredEnvironment("OPENAI_API_KEY");
const betaUserIds = configuredUuidSet("CV_IMPORT_BETA_USER_IDS");
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_CV_IMPORT_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const handler = createCvImportHandler({
  betaUserIds,
  allowedOrigins,
  now: () => Date.now(),
  log: (event) => console.info(JSON.stringify({ event: "cv_import_extract", ...event })),

  async authenticate(token) {
    const authorization = `Bearer ${token}`;
    const headers = userScopedHeaders(apiKeys.publishable, authorization);
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
    if (!userResponse.ok) throw new Error("invalid_token");
    const user = await userResponse.json() as { id?: unknown };
    if (typeof user.id !== "string") throw new Error("invalid_token");

    const accountUrl = new URL(`${supabaseUrl}/rest/v1/accounts`);
    accountUrl.searchParams.set("id", `eq.${user.id}`);
    accountUrl.searchParams.set("select", "status");
    accountUrl.searchParams.set("limit", "1");
    const accountResponse = await fetch(accountUrl, { headers });
    if (!accountResponse.ok) throw new Error("account_lookup_failed");
    const accounts = await accountResponse.json() as Array<{ status?: unknown }>;
    return { id: user.id.toLowerCase(), active: accounts[0]?.status === "active" };
  },

  extract: ({ bytes, filename }) => extractCvImportWithOpenAi({
    bytes,
    filename,
    apiKey: openAiApiKey
  })
});

Deno.serve(handler);
