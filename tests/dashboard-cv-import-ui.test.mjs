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
  assert.match(page, /id="dashboard-cv-export"/);
  assert.match(script, /requestImportPdfSelection/);
  assert.match(script, /importFileInput\.click\(\)/);
  assert.match(script, /PROCESSING CV\.\.\./);
  assert.match(script, /EXTERNAL AI SERVICE FOR CV EXTRACTION/);
  assert.match(script, /renderImportFailure/);
  assert.match(script, /TRY AGAIN/);
  assert.match(script, /renderImportReview/);
  assert.match(script, /onActiveChange\(active\)/);
  assert.match(script, /importButton\.disabled = !importAvailable \|\| importRequestActive/);
  assert.match(script, /importFileInput\.disabled = importRequestActive/);
  assert.doesNotMatch(script, /createCvImportReviewState\(CV_IMPORT_REVIEW_FIXTURE\)[\s\S]*openImportPdfPicker/);
  assert.match(script, /previewState === "review"/);
  const previewBranch = script.slice(script.indexOf("const previewState"), script.indexOf("return;", script.indexOf("const previewState")));
  assert.doesNotMatch(previewBranch, /acceptSelection|service\.extract|functions\.invoke/);
  assert.doesNotMatch(page, /dashboard-cv-import\.html/);
  assert.doesNotMatch(script, /dashboard-cv-import\.html/);
  assert.match(script, /NOT IMPORTED/);
  assert.match(script, /NEEDS REVIEW/);
  assert.match(script, /ADDING CV\.\.\./);
  assert.match(script, /repository\.importManualEntries/);
  assert.match(script, /CV COULD NOT BE ADDED/);
  assert.match(script, /await reloadCv\(\)/);
  assert.match(script, /createCvImportReviewState\([\s\S]*?result,[\s\S]*?currentCategories/);
  assert.match(script, /candidate\.alreadyInCv/);
  assert.match(script, /add\.disabled = importAddActive \|\| summary\.selected < 1/);
  assert.match(script, /cancel\.disabled = importAddActive/);
  assert.match(script, /importSuccessMessage/);
  assert.match(reviewState, /sourceActivityId: null/);
  assert.match(extraction, /functions\.invoke|invoke\("cv-import-extract"/);
  assert.doesNotMatch(script, /api\.openai\.com|OPENAI_API_KEY|Authorization/);
  assert.match(css, /dashboard-cv-import-entry/);
  assert.match(css, /dashboard-cv-import-actions/);
  assert.match(page, /id="dashboard-cv-pdf-delivery"[\s\S]*id="dashboard-cv-share-pdf"[\s\S]*id="dashboard-cv-download-pdf"/);
  assert.match(page, /assets\/vendor\/pdf-lib\.min\.js[\s\S]*assets\/vendor\/fontkit\.umd\.min\.js/);
  assert.match(script, /createCvExportSelectionState/);
  assert.match(script, /renderCvPdf/);
  assert.match(script, /createPdfDelivery/);
  assert.match(script, /EXPORT CV/);
  assert.match(script, /GENERATING PDF\.\.\./);
  assert.match(script, /CV COULD NOT BE EXPORTED/);
  assert.match(script, /setExportAvailable\(categories\.some/);
  assert.match(script, /clearPdfDelivery\(\)/);
  const exportHandler = script.slice(script.indexOf("async function generateCvExport"), script.indexOf("function leaveImportReview"));
  assert.doesNotMatch(exportHandler, /repository\.|\.insert\(|\.upsert\(/);
  assert.match(exportHandler, /exportGenerationActive\) return/);
  assert.match(exportHandler, /exportFailed = true/);
  assert.match(exportHandler, /CV COULD NOT BE EXPORTED/);
  assert.match(script, /generate\.disabled = exportGenerationActive \|\| summary\.selected < 1/);
  const exportMode = script.slice(script.indexOf("function renderExportMode"), script.indexOf("function enterExportMode"));
  assert.doesNotMatch(exportMode, /EDIT|createInlineEditor|repository\./);
  const cancelExport = script.slice(script.indexOf("function leaveExportMode"), script.indexOf("async function generateCvExport"));
  assert.match(cancelExport, /exportSelection = null/);
  assert.match(cancelExport, /renderCategories\(currentCategories\)/);
  assert.match(script, /exportPreviewState === "selection"/);
  assert.match(css, /dashboard-cv-export-entry/);
  assert.equal((page.match(/dashboard-cv\.js/g) ?? []).length, 1);
});

test("ADD persists only the reviewed safe projection through the atomic repository method", async () => {
  const script = await readFile(new URL("../dashboard-cv.js", import.meta.url), "utf8");
  const addHandler = script.slice(script.indexOf("add.addEventListener"), script.indexOf("endActions.append"));
  assert.match(addHandler, /selectedCvImportPersistenceProjection/);
  assert.match(addHandler, /importPersistenceFlow\.submit/);
  assert.doesNotMatch(addHandler, /unsupportedSections|provider|source\b|PDF|base64/i);
  assert.doesNotMatch(addHandler, /createManualEntry|\.insert\(|\.upsert\(/);

  const cancelHandler = script.slice(
    script.indexOf("cancel.addEventListener(\"click\", () => leaveImportReview())"),
    script.indexOf("add.addEventListener", script.indexOf("cancel.addEventListener(\"click\", () => leaveImportReview())"))
  );
  assert.doesNotMatch(cancelHandler, /importManualEntries|importPersistenceFlow\.submit/);
});
