import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (filename) => readFile(
  new URL(`../${filename}`, import.meta.url),
  "utf8"
);

test("page scrolling keeps a native desktop scrollbar", async () => {
  const [styles, indicators] = await Promise.all([
    source("styles.css"),
    source("scroll-indicators.js")
  ]);

  assert.match(styles, /@media \(min-width: 701px\) and \(pointer: fine\)/);
  assert.match(styles, /html::-webkit-scrollbar \{\s+width: 9px;/);
  assert.match(styles, /html::-webkit-scrollbar-thumb \{\s+border-radius: 0;\s+background: var\(--black\);/);
  assert.doesNotMatch(styles, /html\.chained-page-scrollbar/);
  assert.doesNotMatch(indicators, /attachPageIndicator\(root\.document\)/);
});

test("Dashboard Overview uses a native draggable list scrollbar", async () => {
  const [styles, script] = await Promise.all([
    source("dashboard.css"),
    source("dashboard-overview.js")
  ]);

  assert.match(styles, /dashboard-work-list::-webkit-scrollbar,\s+\.dashboard-overview-page\s+\.dashboard-recent-presentation-list::-webkit-scrollbar \{\s+width: 9px;/);
  assert.match(styles, /dashboard-work-list::-webkit-scrollbar-thumb/);
  assert.doesNotMatch(styles, /dashboard-work-list[\s\S]{0,400}scrollbar-width: none;/);
  assert.doesNotMatch(script, /dashboard-scroll-indicator/);
});
