import test from "node:test";
import assert from "node:assert/strict";
import {
  benchmarkCvImport,
  candidatePersistenceShape,
  normalizeCvImportResult,
  validateCvImportResult
} from "../scripts/cv-import-prototype.mjs";

const candidate = (overrides = {}) => ({
  candidateId: "c-1",
  categoryType: "education",
  yearLabel: " 2024 ",
  title: "  Example Academy  ",
  organization: "  ",
  locationText: null,
  url: null,
  source: { pageNumber: 1, sectionHeading: "EDUCATION", excerpt: "Example Academy", sequence: 0 },
  confidence: "high",
  needsReview: false,
  duplicateState: "new",
  warnings: [],
  ...overrides
});
const result = (candidates = [candidate()]) => ({
  source: { documentKind: "text", pageCount: 1, extractedCharacterCount: 20 },
  candidates,
  warnings: []
});

test("valid candidate is accepted and optional empty values normalize safely", () => {
  const normalized = normalizeCvImportResult(result());
  assert.equal(normalized.candidates[0].yearLabel, "2024");
  assert.equal(normalized.candidates[0].organization, null);
  assert.deepEqual(candidatePersistenceShape(normalized.candidates[0]), {
    categoryType: "education", yearLabel: "2024", title: "Example Academy",
    organization: null, locationText: null, url: null, sourceActivityId: null
  });
});

test("unsupported category, missing title and invalid URL are rejected", () => {
  assert.throws(() => validateCvImportResult(result([candidate({ categoryType: "unsupported" })])), /unsupported/);
  assert.throws(() => validateCvImportResult(result([candidate({ title: "" })])), /title/);
  assert.throws(() => validateCvImportResult(result([candidate({ url: "javascript:alert(1)" })])), /HTTP/);
});

test("year and title database limits are enforced", () => {
  assert.throws(() => validateCvImportResult(result([candidate({ yearLabel: "x".repeat(41) })])), /yearLabel/);
  assert.throws(() => validateCvImportResult(result([candidate({ title: "x".repeat(301) })])), /title/);
});

test("unknown provider fields never enter the persistence projection", () => {
  assert.throws(() => validateCvImportResult(result([candidate({ providerSecret: "do-not-copy" })])), /unsupported field/);
  const normalized = normalizeCvImportResult(result());
  const persistence = candidatePersistenceShape(normalized.candidates[0]);
  assert.equal("confidence" in persistence, false);
  assert.equal("source" in persistence, false);
  assert.equal("providerSecret" in persistence, false);
});

test("benchmark detects exact matches, missed entries, invented entries, and field corrections", () => {
  const candidates = [
    candidate({ candidateId: "exact" }),
    candidate({ candidateId: "wrong", categoryType: "award", title: "Second Entry", yearLabel: "2022" }),
    candidate({ candidateId: "invented", title: "Invented" })
  ];
  const reference = [
    { categoryType: "education", yearLabel: "2024", title: "Example Academy", organization: null },
    { categoryType: "award", yearLabel: "2022", title: "Second Entry", organization: null },
    { categoryType: "residency", yearLabel: "2021", title: "Missing Entry", organization: null }
  ];
  const report = benchmarkCvImport(reference, result(candidates));
  assert.equal(report.matched, 2);
  assert.equal(report.missed.length, 1);
  assert.equal(report.missed[0].title, "Missing Entry");
  assert.equal(report.unmatched.length, 1);
  assert.equal(report.unmatched[0].title, "Invented");
  assert.equal(report.exactCategory, 2);
  assert.equal(report.exactYear, 2);
  assert.equal(report.exactTitle, 2);
  assert.equal(report.needsCorrection, 0);
});

test("benchmark flags wrong category/year without fuzzy matching", () => {
  const reference = [{ categoryType: "education", yearLabel: "2024", title: "Example Academy", organization: null }];
  const report = benchmarkCvImport(reference, result([candidate({ categoryType: "award", yearLabel: "2023" })]));
  assert.equal(report.matched, 1);
  assert.equal(report.exactCategory, 0);
  assert.equal(report.exactYear, 0);
  assert.equal(report.exactTitle, 1);
  assert.equal(report.needsCorrection, 1);
});
