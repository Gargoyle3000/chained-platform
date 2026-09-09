import test from "node:test";
import assert from "node:assert/strict";
import {
  CV_CATEGORY_TYPES,
  createCvImportReviewState,
  cvImportExactDuplicateKey,
  cvImportReviewSummary,
  groupCvImportReviewCandidates,
  selectedCvImportPersistenceProjection,
  updateCvImportReviewCandidate
} from "../data/cv-import-review.mjs";
import { CV_IMPORT_REVIEW_FIXTURE } from "../data/cv-import-review-fixture.mjs";

test("review state groups the committed synthetic result in fixed CV order with every normal candidate selected", () => {
  const state = createCvImportReviewState(CV_IMPORT_REVIEW_FIXTURE);
  const groups = groupCvImportReviewCandidates(state);

  assert.equal(state.candidates.length, 10);
  assert.equal(state.candidates.every((candidate) => candidate.selected), true);
  assert.deepEqual(groups.map((group) => group.categoryType), CV_CATEGORY_TYPES);
  assert.equal(state.candidates.find((candidate) => candidate.needsReview).selected, true);
  assert.deepEqual(cvImportReviewSummary(state), {
    found: 10, selected: 10, excluded: 0, needsReview: 1, unsupportedSections: 2
  });
});

test("review selection and local edits update only review state and retain no-year entries naturally", () => {
  const state = createCvImportReviewState(CV_IMPORT_REVIEW_FIXTURE);
  const collection = state.candidates.find((candidate) => candidate.categoryType === "collection");

  assert.equal(collection.yearLabel, null);
  assert.equal(updateCvImportReviewCandidate(state, collection.candidateId, {
    selected: false,
    categoryType: "grant",
    yearLabel: "2026",
    title: "  Edited collection line  "
  }), true);
  assert.equal(updateCvImportReviewCandidate(state, collection.candidateId, {
    categoryType: "publication"
  }), true);
  assert.equal(collection.categoryType, "grant");
  assert.equal(collection.yearLabel, "2026");
  assert.equal(collection.title, "Edited collection line");
  assert.deepEqual(cvImportReviewSummary(state), {
    found: 10, selected: 9, excluded: 1, needsReview: 1, unsupportedSections: 2
  });
});

test("selected projection is persistence-safe manual CV data and unsupported sections never enter it", () => {
  const state = createCvImportReviewState(CV_IMPORT_REVIEW_FIXTURE);
  const projection = selectedCvImportPersistenceProjection(state);

  assert.equal(projection.length, 10);
  assert.equal(projection.every((entry) => entry.sourceActivityId === null), true);
  assert.equal(projection.every((entry) => CV_CATEGORY_TYPES.includes(entry.categoryType)), true);
  assert.equal(projection.every((entry) => (
    Object.keys(entry).sort().join(",") === [
      "categoryType",
      "locationText",
      "organization",
      "sourceActivityId",
      "title",
      "url",
      "yearLabel"
    ].sort().join(",")
  )), true);
  assert.equal(JSON.stringify(projection).includes("PRESS"), false);
  assert.equal(JSON.stringify(projection).includes("SIDELINE"), false);
  assert.equal(projection.every((entry) => !("source" in entry)), true);
  assert.equal(projection.every((entry) => !("activityId" in entry)), true);
  assert.equal(projection.every((entry) => !("confidence" in entry)), true);
  assert.equal(projection.every((entry) => !("candidateId" in entry)), true);
});

test("exact existing CV duplicates are marked ALREADY IN CV and start unchecked", () => {
  const existing = CV_IMPORT_REVIEW_FIXTURE.candidates[0];
  const state = createCvImportReviewState({
    candidates: [
      ...CV_IMPORT_REVIEW_FIXTURE.candidates,
      { ...existing, candidateId: "synthetic-variant", title: "Different title", duplicateState: "duplicate" }
    ],
    unsupportedSections: []
  }, [{
    categoryType: existing.categoryType,
    entries: [{
      sourceActivityId: "existing-presentation-source",
      yearLabel: `  ${existing.yearLabel}  `,
      title: existing.title,
      organization: existing.organization,
      locationText: existing.locationText
    }]
  }]);

  const duplicate = state.candidates.find((candidate) => candidate.candidateId === existing.candidateId);
  const providerOnlyDuplicate = state.candidates.find((candidate) => candidate.candidateId === "synthetic-variant");
  assert.equal(duplicate.alreadyInCv, true);
  assert.equal(duplicate.selected, false);
  assert.equal(providerOnlyDuplicate.alreadyInCv, false);
  assert.equal(providerOnlyDuplicate.selected, true);
  assert.equal(cvImportReviewSummary(state).selected, 10);
});

test("duplicate matching is category, normalized year, and normalized complete line only", () => {
  const first = {
    categoryType: "education",
    yearLabel: " 2020 – 2024 ",
    title: "BA  Fine Arts",
    organization: "Academy",
    locationText: "Amsterdam"
  };
  const same = {
    ...first,
    yearLabel: "2020 – 2024",
    title: " BA Fine Arts "
  };
  const differentPunctuation = {
    ...same,
    title: "BA Fine Arts."
  };

  assert.equal(cvImportExactDuplicateKey(first), cvImportExactDuplicateKey(same));
  assert.notEqual(cvImportExactDuplicateKey(first), cvImportExactDuplicateKey(differentPunctuation));
});

test("editing a candidate as one complete line clears old structured fragments and rechecks duplicates", () => {
  const state = createCvImportReviewState(CV_IMPORT_REVIEW_FIXTURE, [{
    categoryType: "collection",
    entries: [{
      sourceActivityId: null,
      yearLabel: "2026",
      title: "Edited complete line",
      organization: "",
      locationText: ""
    }]
  }]);
  const collection = state.candidates.find((candidate) => candidate.categoryType === "collection");

  updateCvImportReviewCandidate(state, collection.candidateId, {
    yearLabel: "2026",
    completeLine: " Edited   complete line "
  });

  assert.equal(collection.title, "Edited complete line");
  assert.equal(collection.organization, null);
  assert.equal(collection.locationText, null);
  assert.equal(collection.url, null);
  assert.equal(collection.alreadyInCv, true);
  assert.equal(collection.selected, false);
});

test("review state remains structurally compact for 125 candidates", () => {
  const state = createCvImportReviewState({
    candidates: Array.from({ length: 125 }, (_, index) => ({
      ...CV_IMPORT_REVIEW_FIXTURE.candidates[index % CV_IMPORT_REVIEW_FIXTURE.candidates.length],
      candidateId: `bulk-${index}`
    })),
    unsupportedSections: []
  });

  assert.equal(state.candidates.length, 125);
  assert.equal(cvImportReviewSummary(state).selected, 125);
  assert.equal(groupCvImportReviewCandidates(state).reduce((total, group) => total + group.candidates.length, 0), 125);
});
