import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("SELECT is the user-facing private workspace while Archive stays internal and CHAINED SELECT stays the export", async () => {
  const [page, projectPage, action, repository, discover] = await Promise.all([
    read("archive.html"),
    read("archive-project.html"),
    read("data/archive-work-action.mjs"),
    read("data/archive-repository.mjs"),
    read("discover.html")
  ]);

  assert.match(page, /<title>Select — CHAINED<\/title>/);
  assert.match(page, /href="archive\.html">SELECT<\/a>/);
  assert.match(page, /<h1>SELECT<\/h1>[\s\S]*?PRIVATE WORKSPACE \/ ARCHIVE/);
  assert.match(page, /placeholder="SEARCH SELECT"/);
  assert.match(page, /aria-label="Choose Select view"/);
  assert.match(projectPage, /<title>Select Project — CHAINED<\/title>/);
  assert.match(projectPage, /\[ BACK TO SELECT \]/);
  assert.match(discover, /<template data-authenticated-navigation>[\s\S]*?href="archive\.html">SELECT<\/a>/);
  assert.match(action, /\$\{isSaved \? "Remove" : "Save"\}[\s\S]*?Select/);
  assert.match(action, /SELECT IS CURRENTLY UNAVAILABLE/);
  assert.match(page, /\[ EXPORT CHAINED SELECT \]/);
  assert.match(repository, /ARCHIVE_DATA_SOURCE = "supabase-only"/);
  assert.match(repository, /\.from\("archive_items"\)/);
});

test("Archive renders direct Project SELECT export only from active Project state", async () => {
  const [page, script] = await Promise.all([read("archive.html"), read("archive.js")]);
  assert.match(page, /archive-project-context-actions[\s\S]*archive-select-project[^>]*>\[ EXPORT CHAINED SELECT \]/);
  assert.match(page, /archive-select-status/);
  assert.match(page, /id="archive-pdf-delivery"[\s\S]*id="archive-share-pdf"[\s\S]*\[ SAVE \/ SHARE PDF \][\s\S]*id="archive-download-pdf"[\s\S]*\[ DOWNLOAD PDF \]/);
  assert.doesNotMatch(page, /archive-select-images|>\[ SELECT IMAGES \]</);
  assert.match(page, /data-export-image-summary[\s\S]*data-export-image-cancel[\s\S]*\[ EXPORT SELECT \]/);
  assert.doesNotMatch(page, /CHAINED SELECT FILTERED|archive-select\.html/);
  assert.match(script, /function renderProjects\(\)[\s\S]*projectSelectButton\.hidden = !project[\s\S]*openExportImageSelection\(imageDialog, projectWorks/);
  assert.match(script, /function selectProject\(projectId[\s\S]*renderProjects\(\);[\s\S]*renderWorks\(\);/);
  assert.match(script, /loadArchive\(\)[\s\S]*renderTags\(\); renderProjects\(\); renderWorks\(\);/);
  assert.match(script, /currentProjectChainedSelectSource\(repository, project\.id\)/);
  assert.match(script, /createExportImageSelectionState\(projectSelectWorks\)/);
  assert.match(script, /onConfirm: \(\) => void runProjectChainedSelect\(project\)/);
  assert.match(script, /createPdfDelivery/);
  assert.match(script, /setProjectPdfDelivery\(result\.output\.bytes, result\.filename\)/);
  assert.doesNotMatch(script, /downloadBlob\(/);
  assert.match(script, /repository\.listArchivedSelectWorks\(workIds\)/);
  assert.match(script, /\[ LOADING IMAGES \]/);
  assert.doesNotMatch(script, /writeChainedSelectSession|archive-select\.html|filterSelectButton/);
});

test("direct Project Select uses public media only and keeps revalidation before source fetch", async () => {
  const [generator, repository] = await Promise.all([read("data/chained-select-direct-generator.mjs"), read("data/archive-repository.mjs")]);
  assert.match(generator, /revalidateProjectChainedSelect/);
  assert.match(generator, /applyExportImageSelection\(revalidated\.works, imageSelection\)/);
  assert.match(generator, /fetch\(image\.src/);
  assert.doesNotMatch(generator, /authorizedPrivateMedia|downloadAuthorizedPrivateMedia|privatePreview|signed/i);
  assert.match(repository, /derivativeLargePublicPath/);
  assert.doesNotMatch(repository, /private_object_path/);
});

test("old review route, review state, and session navigation are absent", async () => {
  const [page, script] = await Promise.all([read("archive.html"), read("archive.js")]);
  await assert.rejects(() => access(new URL("../archive-select.html", import.meta.url)));
  await assert.rejects(() => access(new URL("../data/chained-select-state.mjs", import.meta.url)));
  await assert.rejects(() => access(new URL("../data/chained-select-review.mjs", import.meta.url)));
  assert.doesNotMatch(script, /writeChainedSelectSession|chained-select-state|chained-select-review|archive-select\.html/);
  assert.doesNotMatch(page, /CHAINED SELECT FILTERED/);
});
