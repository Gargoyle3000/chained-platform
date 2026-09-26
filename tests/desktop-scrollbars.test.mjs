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

  assert.match(styles, /@media \(min-width: 701px\) and \(hover: hover\)/);
  assert.match(styles, /html,\s+body \{\s+scrollbar-gutter: stable;/);
  assert.match(styles, /html::-webkit-scrollbar,\s+body::-webkit-scrollbar \{\s+width: var\(--scrollbar-width-page\);/);
  assert.match(styles, /html::-webkit-scrollbar-thumb,\s+body::-webkit-scrollbar-thumb \{\s+border-radius: 0;\s+background: var\(--scrollbar-thumb\);/);
  assert.match(styles, /--scrollbar-thumb: var\(--accent\);/);
  assert.match(styles, /--scrollbar-width-page: 6px;/);
  assert.match(styles, /--scrollbar-width-compact: 3px;/);
  assert.match(styles, /html\.chained-mobile-page-scrollbar,[\s\S]*?scrollbar-width: none;/);
  assert.match(styles, /\.chained-page-scroll-indicator \{[\s\S]*?width: 3px;[\s\S]*?background: var\(--accent\);[\s\S]*?pointer-events: none;/);
  assert.match(indicators, /\(max-width: 700px\) and \(pointer: coarse\)/);
  assert.match(indicators, /attachPageIndicator\(root\.document\)/);
});

test("Dashboard Overview uses a native draggable list scrollbar", async () => {
  const [styles, script] = await Promise.all([
    source("dashboard.css"),
    source("dashboard-overview.js")
  ]);

  assert.match(styles, /dashboard-work-list::-webkit-scrollbar,\s+\.dashboard-overview-page\s+\.dashboard-recent-presentation-list::-webkit-scrollbar \{\s+width: var\(--scrollbar-width-compact\);/);
  assert.match(styles, /dashboard-work-list::-webkit-scrollbar-thumb/);
  assert.match(styles, /scrollbar-color: var\(--scrollbar-thumb\) var\(--scrollbar-track\)/);
  assert.match(styles, /dashboard-recent-presentation-list::-webkit-scrollbar-thumb \{\s+border-radius: 0;\s+background: var\(--scrollbar-thumb\);/);
  assert.match(styles, /\.dashboard-overview-page \{\s+--scrollbar-width-compact: 2px;/);
  assert.doesNotMatch(styles, /dashboard-work-list[\s\S]{0,400}scrollbar-width: none;/);
  assert.doesNotMatch(script, /dashboard-scroll-indicator/);

  const compactListRules = styles.slice(styles.lastIndexOf("/* MINIMAL RECENT SCROLL INDICATOR */"));
  assert.match(compactListRules, /dashboard-work-list,[\s\S]*dashboard-recent-presentation-list \{[\s\S]*padding-right: 12px;[\s\S]*scrollbar-gutter: stable;/);
});

test("root splash does not load the page indicator", async () => {
  const page = await source("index.html");
  assert.doesNotMatch(page, /scroll-indicators\.js/);
});
