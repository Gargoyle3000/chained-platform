export const FORMAT_DISCIPLINES = Object.freeze([
  Object.freeze({ value: "painting", label: "PAINTING" }),
  Object.freeze({ value: "sculpture", label: "SCULPTURE" }),
  Object.freeze({ value: "installation", label: "INSTALLATION" }),
  Object.freeze({ value: "photography", label: "PHOTOGRAPHY" }),
  Object.freeze({ value: "video", label: "VIDEO" }),
  Object.freeze({ value: "performance", label: "PERFORMANCE" }),
  Object.freeze({ value: "sound", label: "SOUND" }),
  Object.freeze({ value: "publication", label: "PUBLICATION" }),
  Object.freeze({ value: "digital", label: "DIGITAL WORK" }),
  Object.freeze({ value: "other", label: "OTHER" })
]);

export const FORMAT_DISCIPLINE_VALUES = Object.freeze(
  FORMAT_DISCIPLINES.map(({ value }) => value)
);

const allowedFormatDisciplines = new Set(FORMAT_DISCIPLINE_VALUES);

export function canonicalizeFormatDisciplines(values = []) {
  if (!Array.isArray(values)) {
    throw new TypeError("FORMAT DISCIPLINES MUST BE AN ARRAY");
  }

  const selected = new Set();
  values.forEach((value) => {
    if (typeof value !== "string" || !allowedFormatDisciplines.has(value)) {
      throw new TypeError("INVALID FORMAT DISCIPLINE");
    }
    selected.add(value);
  });

  return FORMAT_DISCIPLINE_VALUES.filter((value) => selected.has(value));
}
