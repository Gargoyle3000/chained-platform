function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function valuesFrom(value) {
  if (Array.isArray(value)) return value.flatMap(valuesFrom);
  return clean(value).split(",").map(clean).filter(Boolean);
}

export function materialSearchTerms(values) {
  const terms = [];
  const seen = new Set();

  (Array.isArray(values) ? values : [values])
    .flatMap(valuesFrom)
    .forEach((value) => {
      const normalized = value.toLocaleLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      terms.push(normalized);
    });

  return Object.freeze(terms);
}

export function materialDisplayValues(value) {
  return Object.freeze(valuesFrom(value));
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
