import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Dashboard starts without a stale Work count", async () => {
  const page = await read("dashboard.html");
  assert.match(page, /id="dashboard-work-total">\s*—/);
  assert.match(page, /id="dashboard-work-breakdown">\s*LOADING WORKS/);
  assert.doesNotMatch(page, /id="dashboard-work-total">\s*4/);
});

test("Discover begins with the current header container", async () => {
  const page = await read("discover.html");
  assert.match(page, /<div class="header-actions">\s*<nav class="main-nav main-nav-with-dashboard"/);
});

test("Portfolio export owns progress at its action and resets safely", async () => {
  const [page, script] = await Promise.all([
    read("dashboard-portfolio-export.html"),
    read("dashboard-portfolio-export.js")
  ]);
  assert.match(page, /id="portfolio-generate"[^>]*>\[ EXPORT PORTFOLIO \]/);
  assert.match(page, /id="portfolio-export-status"/);
  assert.doesNotMatch(page, /portfolio-export-status[\s\S]*portfolio-export-section/);
  assert.match(script, /generateButton\.disabled = isBusy/);
  assert.match(script, /\[ EXPORTING… \$\{progress\}% \]/);
  assert.match(script, /preparedImages \/ totalImages/);
  assert.match(script, /progress = 100/);
  assert.match(script, /if \(!isBusy\) generateButton\.textContent = idleExportLabel/);
  assert.doesNotMatch(script, /ENTER A DOCUMENT TITLE OR TURN OFF TITLE PAGE/);
});
