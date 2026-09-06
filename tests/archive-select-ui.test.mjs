import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Archive renders direct Project SELECT export only from active Project state", async () => {
  const [page, script] = await Promise.all([read("archive.html"), read("archive.js")]);
  assert.match(page, /archive-project-context-actions[\s\S]*archive-select-project[^>]*>\[ EXPORT CHAINED SELECT \]/);
  assert.match(page, /archive-select-status/);
  assert.match(page, /archive-select-images[^>]*>\[ SELECT IMAGES \]/);
  assert.doesNotMatch(page, /CHAINED SELECT FILTERED|archive-select\.html/);
  assert.match(script, /function renderProjects\(\)[\s\S]*projectSelectButton\.hidden = !project[\s\S]*exportProjectChainedSelect\(project\)/);
  assert.match(script, /function selectProject\(projectId[\s\S]*renderProjects\(\);[\s\S]*renderWorks\(\);/);
  assert.match(script, /loadArchive\(\)[\s\S]*renderTags\(\); renderProjects\(\); renderWorks\(\);/);
  assert.match(script, /currentProjectChainedSelectSource\(repository, project\.id\)/);
  assert.match(script, /createExportImageSelectionState\(projectSelectWorks\)/);
  assert.match(script, /openProjectExportImageSelection/);
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
