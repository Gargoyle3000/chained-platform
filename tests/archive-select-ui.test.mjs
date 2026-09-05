import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Archive exposes separate full-Project and explicit filtered CHAINED Select sources", async () => {
  const [page, script] = await Promise.all([read("archive.html"), read("archive.js")]);
  assert.match(page, /archive-select-project[^>]*>\[ CHAINED SELECT \]/);
  assert.match(page, /archive-select-filter[^>]*>\[ CHAINED SELECT FILTERED \]/);
  assert.match(script, /workIds: projectWorkIds\(project\.id\)/);
  assert.match(script, /workIds: visible\.map\(\(work\) => work\.id\)/);
  assert.match(script, /const narrowed = Boolean\(searchTerm \|\| activeTagIds\.size\)/);
});

test("CHAINED Select review uses public media only and keeps public attribution visible", async () => {
  const [page, script, repository] = await Promise.all([
    read("archive-select.html"),
    read("archive-select.js"),
    read("data/archive-repository.mjs")
  ]);
  assert.match(page, /SELECTED BY/);
  assert.match(script, /fetch\(image\.src/);
  assert.match(script, /artistName/);
  assert.doesNotMatch(script, /authorizedPrivateMedia|downloadAuthorizedPrivateMedia|privatePreview|signed/i);
  assert.match(repository, /derivativeLargePublicPath/);
  assert.doesNotMatch(repository, /private_object_path/);
});

test("CHAINED Select revalidates the current selection before fetching public sources", async () => {
  const script = await read("archive-select.js");
  assert.match(script, /revalidateChainedSelectWorks\(\{ repository: archiveRepository, reviewWorks: works, selectedIds: selection\.ids\(\) \}\)/);
  assert.ok(script.indexOf("revalidateChainedSelectWorks") < script.indexOf("fetch(image.src"));
  assert.match(script, /NO LONGER PUBLICLY AVAILABLE · REVIEW BEFORE GENERATING/);
  assert.match(script, /if \(!currentLimit\.valid\) return render\(\);/);
});
