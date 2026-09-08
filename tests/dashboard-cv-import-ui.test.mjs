import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Dashboard CV exposes same-page import review controls and a truthful unavailable export action", async () => {
  const [page, script, css, reviewState] = await Promise.all([
    readFile(new URL("../dashboard-cv.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-cv.js", import.meta.url), "utf8"),
    readFile(new URL("../dashboard.css", import.meta.url), "utf8"),
    readFile(new URL("../data/cv-import-review.mjs", import.meta.url), "utf8")
  ]);

  assert.match(page, /id="dashboard-cv-import"[^>]*disabled/);
  assert.match(page, /id="dashboard-cv-export"[^>]*disabled/);
  assert.match(script, /enterImportReview/);
  assert.match(script, /renderImportReview/);
  assert.match(script, /CV_IMPORT_REVIEW_FIXTURE/);
  assert.doesNotMatch(page, /dashboard-cv-import\.html/);
  assert.doesNotMatch(script, /dashboard-cv-import\.html/);
  assert.match(script, /NOT IMPORTED/);
  assert.match(script, /NEEDS REVIEW/);
  assert.match(script, /ENTRIES READY TO ADD/);
  assert.match(reviewState, /sourceActivityId: null/);
  assert.match(css, /dashboard-cv-import-entry/);
  assert.match(css, /dashboard-cv-import-actions/);
});
