export const CV_CATEGORY_TYPES = Object.freeze([
  "education",
  "solo_exhibition",
  "duo_exhibition",
  "group_presentation",
  "award",
  "grant",
  "collection",
  "residency",
  "teaching",
  "curatorial"
]);

const CONFIDENCES = new Set(["high", "medium", "low"]);
const DUPLICATE_STATES = new Set(["new", "possible", "duplicate"]);
const UNSUPPORTED_SECTION_REASONS = new Set(["unsupported_category"]);
const CANDIDATE_KEYS = new Set([
  "candidateId", "categoryType", "yearLabel", "title", "organization",
  "locationText", "url", "source", "confidence", "needsReview",
  "duplicateState", "warnings"
]);
const SOURCE_KEYS = new Set(["pageNumber", "sectionHeading", "excerpt", "sequence"]);
const DOCUMENT_KEYS = new Set(["documentKind", "pageCount", "extractedCharacterCount"]);
const UNSUPPORTED_SECTION_KEYS = new Set(["heading", "reason", "entryCount"]);
const MAX_CANDIDATES = 500;
const MAX_UNSUPPORTED_SECTIONS = 50;

const nullableString = (maxLength) => ({ type: ["string", "null"], maxLength });
const sourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pageNumber", "sectionHeading", "excerpt", "sequence"],
  properties: {
    pageNumber: { type: ["integer", "null"], minimum: 1 },
    sectionHeading: { type: "string", minLength: 1 },
    excerpt: { type: "string", minLength: 1 },
    sequence: { type: "integer", minimum: 0 }
  }
};

export const CV_IMPORT_RESULT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["source", "candidates", "warnings", "unsupportedSections"],
  properties: {
    source: {
      type: "object",
      additionalProperties: false,
      required: ["documentKind", "pageCount", "extractedCharacterCount"],
      properties: {
        documentKind: { type: "string", enum: ["pdf", "text"] },
        pageCount: { type: "integer", minimum: 0 },
        extractedCharacterCount: { type: "integer", minimum: 0 }
      }
    },
    candidates: {
      type: "array",
      maxItems: MAX_CANDIDATES,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidateId", "categoryType", "yearLabel", "title", "organization",
          "locationText", "url", "source", "confidence", "needsReview",
          "duplicateState", "warnings"
        ],
        properties: {
          candidateId: { type: "string", minLength: 1 },
          categoryType: { type: "string", enum: CV_CATEGORY_TYPES },
          yearLabel: nullableString(40),
          title: { type: "string", minLength: 1, maxLength: 300 },
          organization: nullableString(300),
          locationText: nullableString(300),
          url: nullableString(2_000),
          source: sourceSchema,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          needsReview: { type: "boolean" },
          duplicateState: { type: "string", enum: ["new", "possible", "duplicate"] },
          warnings: { type: "array", items: { type: "string" } }
        }
      }
    },
    unsupportedSections: {
      type: "array",
      maxItems: MAX_UNSUPPORTED_SECTIONS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "reason", "entryCount"],
        properties: {
          heading: { type: "string", minLength: 1, maxLength: 120 },
          reason: { type: "string", enum: ["unsupported_category"] },
          entryCount: { type: "integer", minimum: 1, maximum: MAX_CANDIDATES }
        }
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  }
});

export const CV_IMPORT_INSTRUCTIONS = [
  "Translate the supplied CV content into CHAINED manual CV candidates only.",
  "Preserve source wording, names, punctuation, and year/period text.",
  "Do not embellish, infer missing venue/city/country, rewrite institutions, or fabricate facts.",
  "Candidates may use only the supplied fixed category enum. If a source section cannot map clearly to one of those categories, do not create a candidate or choose a closest category; add one bounded unsupportedSections entry with reason unsupported_category and its entryCount instead.",
  "Do not add bio, contact, birth, lives/works, or other profile metadata to candidates or unsupportedSections. Archive is a source-organizational heading: retain an Archive entry only when its exhibition context supports an allowed category, and set needsReview true.",
  "Confidence describes extraction confidence only. Include concise source provenance for human review.",
  "Never create Presentations, activities, IDs, database relationships, or sourceActivityId values. Output the schema only."
].join(" ");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(object, allowed, label) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

function assertOptionalText(value, max, label) {
  if (value !== null && value !== undefined && (typeof value !== "string" || value.length > max)) {
    throw new Error(`${label} must be a string of at most ${max} characters or null`);
  }
}

function normalizeWhitespace(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
}

function optionalText(value) {
  const normalized = normalizeWhitespace(value ?? "");
  return normalized === "" ? null : normalized;
}

export function validateCvImportResult(input) {
  if (!isPlainObject(input)) throw new Error("CV import result must be an object");
  assertExactKeys(input, new Set(["source", "candidates", "warnings", "unsupportedSections"]), "result");
  if (!isPlainObject(input.source)) throw new Error("source must be an object");
  assertExactKeys(input.source, DOCUMENT_KEYS, "source");
  if (input.source.documentKind !== "pdf" && input.source.documentKind !== "text") throw new Error("source.documentKind must be pdf or text");
  for (const key of ["pageCount", "extractedCharacterCount"]) {
    if (!Number.isInteger(input.source[key]) || input.source[key] < 0) throw new Error(`source.${key} must be a non-negative integer`);
  }
  if (!Array.isArray(input.candidates) || input.candidates.length > MAX_CANDIDATES) throw new Error(`candidates must be an array of at most ${MAX_CANDIDATES}`);
  if (!Array.isArray(input.warnings) || input.warnings.some((warning) => typeof warning !== "string")) throw new Error("warnings must be an array of strings");
  if (!Array.isArray(input.unsupportedSections) || input.unsupportedSections.length > MAX_UNSUPPORTED_SECTIONS) throw new Error(`unsupportedSections must be an array of at most ${MAX_UNSUPPORTED_SECTIONS}`);
  input.unsupportedSections.forEach((section, index) => {
    const label = `unsupportedSections[${index}]`;
    if (!isPlainObject(section)) throw new Error(`${label} must be an object`);
    assertExactKeys(section, UNSUPPORTED_SECTION_KEYS, label);
    if (typeof section.heading !== "string" || section.heading.trim() === "" || section.heading.length > 120) throw new Error(`${label}.heading is invalid`);
    if (!UNSUPPORTED_SECTION_REASONS.has(section.reason)) throw new Error(`${label}.reason is invalid`);
    if (!Number.isInteger(section.entryCount) || section.entryCount < 1 || section.entryCount > MAX_CANDIDATES) throw new Error(`${label}.entryCount is invalid`);
  });
  input.candidates.forEach((candidate, index) => {
    const label = `candidates[${index}]`;
    if (!isPlainObject(candidate)) throw new Error(`${label} must be an object`);
    assertExactKeys(candidate, CANDIDATE_KEYS, label);
    for (const key of ["candidateId", "categoryType", "title", "confidence", "duplicateState"]) {
      if (typeof candidate[key] !== "string" || candidate[key].trim() === "") throw new Error(`${label}.${key} is required`);
    }
    if (!CV_CATEGORY_TYPES.includes(candidate.categoryType)) throw new Error(`${label}.categoryType is unsupported`);
    assertOptionalText(candidate.yearLabel, 40, `${label}.yearLabel`);
    assertOptionalText(candidate.title, 300, `${label}.title`);
    assertOptionalText(candidate.organization, 300, `${label}.organization`);
    assertOptionalText(candidate.locationText, 300, `${label}.locationText`);
    if (candidate.url !== null && candidate.url !== undefined && (typeof candidate.url !== "string" || !/^https?:\/\//i.test(candidate.url))) throw new Error(`${label}.url must be an HTTP(S) URL or null`);
    if (!CONFIDENCES.has(candidate.confidence)) throw new Error(`${label}.confidence is invalid`);
    if (typeof candidate.needsReview !== "boolean") throw new Error(`${label}.needsReview must be boolean`);
    if (!DUPLICATE_STATES.has(candidate.duplicateState)) throw new Error(`${label}.duplicateState is invalid`);
    if (!Array.isArray(candidate.warnings) || candidate.warnings.some((warning) => typeof warning !== "string")) throw new Error(`${label}.warnings must be an array of strings`);
    if (!isPlainObject(candidate.source)) throw new Error(`${label}.source must be an object`);
    assertExactKeys(candidate.source, SOURCE_KEYS, `${label}.source`);
    if (candidate.source.pageNumber !== null && (!Number.isInteger(candidate.source.pageNumber) || candidate.source.pageNumber < 1)) throw new Error(`${label}.source.pageNumber is invalid`);
    if (typeof candidate.source.sectionHeading !== "string" || candidate.source.sectionHeading.trim() === "") throw new Error(`${label}.source.sectionHeading is required`);
    if (typeof candidate.source.excerpt !== "string" || candidate.source.excerpt.trim() === "") throw new Error(`${label}.source.excerpt is required`);
    if (!Number.isInteger(candidate.source.sequence) || candidate.source.sequence < 0) throw new Error(`${label}.source.sequence is invalid`);
  });
  return input;
}

export function normalizeCvImportResult(input) {
  validateCvImportResult(input);
  return {
    source: { ...input.source },
    warnings: input.warnings.map(normalizeWhitespace),
    unsupportedSections: input.unsupportedSections.map((section) => ({
      heading: normalizeWhitespace(section.heading),
      reason: section.reason,
      entryCount: section.entryCount
    })),
    candidates: input.candidates.map((candidate) => ({
      candidateId: normalizeWhitespace(candidate.candidateId),
      categoryType: candidate.categoryType,
      yearLabel: optionalText(candidate.yearLabel),
      title: normalizeWhitespace(candidate.title),
      organization: optionalText(candidate.organization),
      locationText: optionalText(candidate.locationText),
      url: optionalText(candidate.url),
      source: {
        pageNumber: candidate.source.pageNumber ?? null,
        sectionHeading: normalizeWhitespace(candidate.source.sectionHeading),
        excerpt: normalizeWhitespace(candidate.source.excerpt),
        sequence: candidate.source.sequence
      },
      confidence: candidate.confidence,
      needsReview: candidate.needsReview,
      duplicateState: candidate.duplicateState,
      warnings: candidate.warnings.map(normalizeWhitespace)
    }))
  };
}

export function candidatePersistenceShape(candidate) {
  return {
    categoryType: candidate.categoryType,
    yearLabel: candidate.yearLabel,
    title: candidate.title,
    organization: candidate.organization,
    locationText: candidate.locationText,
    url: candidate.url,
    sourceActivityId: null
  };
}
