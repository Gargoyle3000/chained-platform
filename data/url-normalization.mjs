function clean(value) {
  return String(value ?? "").trim();
}

function isExplicitScheme(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

export function normalizeHttpUrl(value, emptyValue = "") {
  const source = clean(value);
  if (!source) return emptyValue;

  if (/\s/.test(source) || source.startsWith("/") || source.startsWith("?")) {
    throw new Error("URL MUST BE A VALID HTTP OR HTTPS URL");
  }

  if (isExplicitScheme(source) && !/^https?:\/\//i.test(source)) {
    throw new Error("URL MUST BE A VALID HTTP OR HTTPS URL");
  }

  const normalized = isExplicitScheme(source)
    ? source
    : `https://${source}`;

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("URL MUST BE A VALID HTTP OR HTTPS URL");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("URL MUST BE A VALID HTTP OR HTTPS URL");
  }

  return normalized;
}
