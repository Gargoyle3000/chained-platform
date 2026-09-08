import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Dashboard CV opens a native PDF picker and keeps real extraction on the same page", async () => {
  const [page, script, css, reviewState, extraction] = await Promise.all([
    readFile(new URL("../dashboard-cv.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-cv.js", import.meta.url), "utf8"),
    readFile(new URL("../dashboard.css", import.meta.url), "utf8"),
    readFile(new URL("../data/cv-import-review.mjs", import.meta.url), "utf8"),
    readFile(new URL("../data/cv-import-extraction.mjs", import.meta.url), "utf8")
  ]);

  assert.match(page, /id="dashboard-cv-import"[^>]*disabled/);
  assert.match(page, /id="dashboard-cv-import-file"[\s\S]*type="file"[\s\S]*accept="application\/pdf,\.pdf"[\s\S]*hidden/);
  assert.match(page, /id="dashboard-cv-export"[^>]*disabled/);
  assert.match(script, /requestImportPdfSelection/);
  assert.match(script, /importFileInput\.click\(\)/);
  assert.match(script, /PROCESSING CV\.\.\./);
  assert.match(script, /EXTERNAL AI SERVICE FOR CV EXTRACTION/);
  assert.match(script, /renderImportFailure/);
  assert.match(script, /TRY AGAIN/);
  assert.match(script, /renderImportReview/);
  assert.doesNotMatch(script, /createCvImportReviewState\(CV_IMPORT_REVIEW_FIXTURE\)[\s\S]*openImportPdfPicker/);
  assert.match(script, /previewState === "review"/);
  assert.doesNotMatch(page, /dashboard-cv-import\.html/);
  assert.doesNotMatch(script, /dashboard-cv-import\.html/);
  assert.match(script, /NOT IMPORTED/);
  assert.match(script, /NEEDS REVIEW/);
  assert.match(script, /ENTRIES READY TO ADD/);
  assert.match(reviewState, /sourceActivityId: null/);
  assert.match(extraction, /functions\.invoke|invoke\("cv-import-extract"/);
  assert.doesNotMatch(script, /api\.openai\.com|OPENAI_API_KEY|Authorization/);
  assert.match(css, /dashboard-cv-import-entry/);
  assert.match(css, /dashboard-cv-import-actions/);
});

test("ADD remains an in-memory no-write checkpoint and import never calls CV persistence", async () => {
  const script = await readFile(new URL("../dashboard-cv.js", import.meta.url), "utf8");
  const addHandler = script.slice(script.indexOf("add.addEventListener"), script.indexOf("endActions.append"));
  assert.match(addHandler, /selectedCvImportPersistenceProjection/);
  assert.match(addHandler, /ENTRIES READY TO ADD/);
  assert.doesNotMatch(addHandler, /repository\.(create|insert|update|save|upsert)/);
});
