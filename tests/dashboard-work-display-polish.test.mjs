import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RECENT_WORKS_LIMIT, recentWorksCountLabel } from "../data/dashboard-recent-work-copy.mjs";

test("Recent Works wording is truthful for every visible subset", () => {
  assert.equal(RECENT_WORKS_LIMIT, 10);
  assert.equal(recentWorksCountLabel(0, 0), "0 WORKS");
  assert.equal(recentWorksCountLabel(1, 1), "1 WORK");
  assert.equal(recentWorksCountLabel(7, 7), "7 WORKS");
  assert.equal(recentWorksCountLabel(10, 10), "10 WORKS");
  assert.equal(recentWorksCountLabel(13, 10), "10 OF 13");
});

test("Work material preview uses comma-only display punctuation without changing stored values", async () => {
  const source = await readFile(new URL("../dashboard-form.js", import.meta.url), "utf8");
  const start = source.indexOf("function formatMaterialList");
  const end = source.indexOf("function updateMaterialPreview", start);
  const formatter = source.slice(start, end);
  assert.match(formatter, /return values\.join\(", "\);/);
  assert.doesNotMatch(formatter, /\bAND\b/);
});

test("public Work detail uses a centered contained stacked presentation without carousel controls", async () => {
  const [artworkCss, script] = await Promise.all([
    readFile(new URL("../artwork.css", import.meta.url), "utf8"),
    readFile(new URL("../artwork-dynamic.js", import.meta.url), "utf8")
  ]);
  assert.match(artworkCss, /\.artwork-dynamic-page \.artwork-content \{[\s\S]*?justify-items: center;[\s\S]*?transform: none;/);
  assert.match(artworkCss, /\.artwork-dynamic-page \.artwork-main-image img \{[\s\S]*?max-width: 100%;[\s\S]*?max-height:/);
  assert.match(artworkCss, /grid-template-columns:[\s\S]*?var\(--artwork-information-width\)[\s\S]*?minmax\(0, 1fr\)[\s\S]*?var\(--artwork-information-width\)/);
  assert.doesNotMatch(artworkCss, /--artwork-image-shift|translateX\(/);
  assert.match(script, /content\.replaceChildren\([\s\S]*?\.\.\.images\.map\(/);
  assert.doesNotMatch(script, /public-work-carousel\.mjs|carouselControls|attachPublicWorkCarousel/);
});
