import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Dashboard Works groups curation by year and provides restrained keyboard movement", async () => {
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
  assert.doesNotMatch(source, /draggable\s*=/);
});

test("Dashboard reloads authoritative server order when a reorder request fails", async () => {
  const source = await readFile(new URL("../dashboard-works.js", import.meta.url), "utf8");
  assert.match(source, /await repository\.reorderArtistProfileWorks[\s\S]*await renderWorks\(profiles\);[\s\S]*catch \{\s*try \{ await renderWorks\(profiles\); \} catch \{\}\s*setError\("WORK ORDER COULD NOT BE SAVED"\)/);
});
