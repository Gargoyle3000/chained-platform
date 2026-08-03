export class PublicDataError extends Error {
  constructor(kind = "connection") {
    super("PUBLIC DATA IS CURRENTLY UNAVAILABLE");
    this.name = "PublicDataError";
    this.kind = kind;
  }
}

export async function requestPublicRows(config, table, parameters, fetchRows = fetch) {
  let response;

  try {
    response = await fetchRows(
      `${config.supabaseUrl}/rest/v1/${table}?${parameters.toString()}`,
      {
        headers: {
          apikey: config.supabaseKey,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );
  } catch {
    throw new PublicDataError("connection");
  }

  if (!response.ok) {
    throw new PublicDataError(response.status >= 500 ? "connection" : "unavailable");
  }

  try {
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    throw new PublicDataError("connection");
  }
}

export function createPublicImageUrl(client, objectPath) {
  if (typeof objectPath !== "string" || !objectPath.trim()) return null;

  const result = client.storage
    .from("work-public")
    .getPublicUrl(objectPath.trim());
  const value = result?.data?.publicUrl;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
