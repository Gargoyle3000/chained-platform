function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function valuesFrom(value) {
  if (Array.isArray(value)) return value.flatMap(valuesFrom);
  return clean(value).split(",").map(clean).filter(Boolean);
}

export function materialSearchTerms(values) {
  return Object.freeze(
    materialDisplayValues(values).map((value) => value.toLocaleLowerCase())
  );
}

export function materialDisplayValues(value) {
  const seen = new Set();
  return Object.freeze(valuesFrom(value).filter((entry) => {
    const normalized = entry.toLocaleLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }));
}

export function appendMaterialSuggestion(value, suggestion) {
  const source = String(value ?? "");
  const selected = clean(suggestion);
  if (!selected) return source;

  const existing = new Set(materialSearchTerms(source));
  if (existing.has(selected.toLocaleLowerCase())) return source;

  const trimmed = source.trim();
  return trimmed ? `${trimmed}, ${selected}` : selected;
}
