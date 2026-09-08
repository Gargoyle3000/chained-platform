import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Dashboard Works groups curation and preserves restrained arrow fallback", async () => {
  const source = await readFile(new URL("../dashboard-works.js", import.meta.url), "utf8");
  assert.match(source, /groupArtistWorksByYear/);
  assert.match(source, /const yearLabel = group\.year == null \? "UNKNOWN" : String\(group\.year\)/);
  assert.match(source, /createTextAction\("↑"/);
  assert.match(source, /createTextAction\("↓"/);
  assert.doesNotMatch(source, /createTextAction\("MOVE UP"/);
  assert.doesNotMatch(source, /createTextAction\("MOVE DOWN"/);
  assert.match(source, /Move .* up within/);
  assert.match(source, /Move .* down within/);
  assert.match(source, /reorderArtistProfileWorks\(group\.profileId, group\.year/);
  assert.doesNotMatch(source, /row\.draggable\s*=/);
});

test("Dashboard Works uses pointer drag only inside one rendered year bucket", async () => {
  const source = await readFile(new URL("../dashboard-works.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../dashboard.css", import.meta.url), "utf8");
  assert.match(source, /placeWorkWithinYear/);
  assert.match(source, /destinationForWorkDrag/);
  assert.match(source, /session\.rows\.querySelectorAll\("\.dashboard-work-row"\)/);
  assert.match(source, /clientY < bounds\.top - 16 \|\| clientY > bounds\.bottom \+ 16/);
  assert.match(source, /is-work-drop-before/);
  assert.match(source, /is-work-drop-after/);
  assert.match(source, /window\.addEventListener\("pointermove", session\.onMove/);
  assert.match(source, /dashboard-work-primary-actions/);
  assert.match(source, /dashboard-work-reorder-controls/);
  assert.match(source, /thumbnail\.classList\.add\("dashboard-work-reorder-thumbnail"\)/);
  assert.match(source, /thumbnail\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(source, /row\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(source, /dashboard-work-reorder-grip/);
  assert.doesNotMatch(source, /coarsePointer && !fromGrip/);
  assert.match(source, /Move \$\{work\.title.* up within/);
  assert.match(source, /Move \$\{work\.title.* down within/);
  assert.match(source, /workOrderSaving/);
  assert.match(source, /await repository\.reorderArtistProfileWorks\(group\.profileId, group\.year, nextWorkIds\)/);
  assert.match(styles, /\.dashboard-work-row\.is-work-drop-before::before[\s\S]*background: var\(--accent\)/);
  assert.match(styles, /@media \(max-width: 700px\), \(pointer: coarse\) \{\s*\.dashboard-work-reorder-thumbnail\s*\{\s*touch-action: none/);
  assert.match(styles, /\.dashboard-work-reorder-thumbnail\s*\{\s*cursor: grab/);
  assert.match(styles, /\.dashboard-work-row\.is-work-reordering \.dashboard-work-reorder-thumbnail\s*\{\s*cursor: grabbing/);
  assert.match(styles, /\.dashboard-work-primary-actions[\s\S]*align-items: center[\s\S]*flex-wrap: nowrap[\s\S]*gap: 12px/);
  assert.match(styles, /\.dashboard-work-reorder-controls[\s\S]*gap: 3px/);
  assert.match(styles, /\.dashboard-work-actions > \.dashboard-delete-trigger[\s\S]*align-self: flex-start/);
  assert.doesNotMatch(styles, /\.dashboard-work-row\s*\{\s*cursor: grab/);
  assert.doesNotMatch(styles, /\.dashboard-work-row\s*\{[^}]*touch-action/s);
});

test("Dashboard reloads authoritative server order when a reorder request fails", async () => {
  const source = await readFile(new URL("../dashboard-works.js", import.meta.url), "utf8");
  assert.match(source, /await repository\.reorderArtistProfileWorks[\s\S]*await renderWorks\(profiles\);[\s\S]*catch \{\s*try \{ await renderWorks\(profiles\); \} catch \{\}\s*setError\("WORK ORDER COULD NOT BE SAVED"\)/);
});
