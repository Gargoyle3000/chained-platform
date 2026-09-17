import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("Archive source filters sit above Tags and remain system-derived controls", async () => {
  const [page, script, css] = await Promise.all([read("archive.html"), read("archive.js"), read("archive.css")]);
  assert.match(page, /archive-source-section[\s\S]*?\[ ALL \][\s\S]*?\[ PERSONAL \][\s\S]*?\[ SAVED \][\s\S]*?archive-tags-section/);
  assert.match(script, /let activeSourceScope = "all";/);
  assert.match(script, /selectedProjectId \? "all" : activeSourceScope/);
  assert.match(script, /sourceFilters\.hidden = projectIsOpen;/);
  assert.match(script, /activeSourceScope = normalizeArchiveSourceScope\(button\.dataset\.archiveSource\);[\s\S]*renderWorks\(\);/);
  assert.match(css, /\.archive-source-filters \{[\s\S]*flex-wrap: wrap;/);
});

test("Archive SINGLE centers its existing content column without changing image containment", async () => {
  const css = await read("archive.css");
  assert.match(css, /\.archive-page\[data-view="single"\] \.saved-grid \{[\s\S]*max-width: 1100px;[\s\S]*margin-inline: auto;/);
  assert.match(css, /\.archive-page\[data-view="single"\] \.saved-work img \{[\s\S]*max-height: 78svh;[\s\S]*object-fit: contain;/);
});

test("Archive reuses the contained shared carousel without changing its Work action state", async () => {
  const [script, css] = await Promise.all([read("archive.js"), read("archive.css")]);
  assert.match(script, /attachPublicWorkCarousel\(\{[\s\S]*listArchivedSelectWorks\(\[workId\]\)[\s\S]*current\?\.images \|\| \[work\.image\]/);
  assert.match(script, /createPublicWorkCarouselControls\(document\)/);
  assert.match(css, /\.saved-work\.has-public-work-carousel > \.saved-work-image-link \{[\s\S]*touch-action: pan-y;/);
  assert.match(css, /\.archive-page\[data-view="grid"\] \.saved-work\.has-public-work-carousel > \.saved-work-image-link \{[\s\S]*aspect-ratio: var\(--public-carousel-cover-ratio\);/);
});

test("Archive Project clearing resets delivery and export-local selection state", async () => {
  const script = await read("archive.js");
  assert.match(script, /function clearProjectExportState\(\) \{[\s\S]*clearProjectPdfDelivery\(\);[\s\S]*projectImageSelection = createExportImageSelectionState\(\);[\s\S]*projectImageSelectionId = null;[\s\S]*projectSelectWorks = \[\];/);
  assert.match(script, /function renderProjects\(\)[\s\S]*else \{[\s\S]*clearProjectExportState\(\);/);
  assert.match(script, /toggleArchiveProjectId\(selectedProjectId, entry\.id, projects\)/);
  assert.match(script, /projectCloseButton\.addEventListener\("click", \(\) => void selectProject\(null\)\)/);
  assert.match(script, /activeTagIds = toggleArchiveTagId\(activeTagIds, tag\.id\);/);
});

test("Archive Work management menus explicitly retain opening and inside-menu clicks", async () => {
  const script = await read("archive.js");
  assert.match(script, /toggle\.addEventListener\("click", \(event\) => \{[\s\S]*event\.stopPropagation\(\);[\s\S]*menu\.dataset\.open = "true"/);
  assert.match(script, /menu\.addEventListener\("click", \(event\) => event\.stopPropagation\(\)\);/);
  assert.match(script, /document\.addEventListener\("click", \(event\) => \{[\s\S]*openWorkManagementMenu[\s\S]*!openWorkManagementMenu\.menu\.contains\(event\.target\)[\s\S]*closeWorkManagementMenu\(\);/);
  assert.match(script, /if \(openWorkManagementMenu\) \{ event\.preventDefault\(\); closeWorkManagementMenu\(true\); return; \}/);
});

test("Archive Work management menus use measured fixed viewport placement and clean it up on close", async () => {
  const script = await read("archive.js");
  const css = await read("archive.css");
  assert.match(script, /function createSupergridManagement\(work\)[\s\S]*menu\.classList\.add\("is-anchored"\);[\s\S]*calculateAnchoredPopoverPosition\(\{[\s\S]*trigger: toggle\.getBoundingClientRect\(\),[\s\S]*popover: menu\.getBoundingClientRect\(\),[\s\S]*window\.addEventListener\("scroll", reposition, true\);[\s\S]*window\.addEventListener\("resize", reposition\);/);
  assert.match(script, /function closeWorkManagementMenu\(returnFocus = false\)[\s\S]*window\.removeEventListener\("scroll", reposition, true\);[\s\S]*window\.removeEventListener\("resize", reposition\);[\s\S]*menu\.classList\.remove\("is-anchored"\);[\s\S]*menu\.style\.removeProperty\("left"\);[\s\S]*menu\.style\.removeProperty\("top"\);/);
  assert.match(css, /\.archive-supergrid-menu\.is-anchored \{[\s\S]*position: fixed;[\s\S]*z-index: 40;/);
});
