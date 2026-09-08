import test from "node:test";
import assert from "node:assert/strict";
import {
  CV_CATEGORY_TYPES,
  createCvImportReviewState,
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
  assert.equal(JSON.stringify(projection).includes("PRESS"), false);
  assert.equal(JSON.stringify(projection).includes("SIDELINE"), false);
  assert.equal(projection.every((entry) => !("source" in entry)), true);
  assert.equal(projection.every((entry) => !("activityId" in entry)), true);
});

test("future duplicate support starts known duplicates unchecked without changing normal default selection", () => {
  const state = createCvImportReviewState({
    candidates: [
      ...CV_IMPORT_REVIEW_FIXTURE.candidates,
      { ...CV_IMPORT_REVIEW_FIXTURE.candidates[0], candidateId: "synthetic-duplicate", duplicateState: "duplicate" }
    ],
    unsupportedSections: []
  });

  assert.equal(state.candidates.find((candidate) => candidate.candidateId === "synthetic-duplicate").selected, false);
  assert.equal(cvImportReviewSummary(state).selected, 10);
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
