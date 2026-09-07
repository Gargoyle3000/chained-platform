import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("mobile core pages share content-start and content-rhythm tokens", async () => {
  const [styles, profile, archive, agenda] = await Promise.all([
    source("../styles.css"),
    source("../profile.css"),
    source("../archive.css"),
    source("../agenda.css")
  ]);

  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*--mobile-content-start: 28px;[\s\S]*--mobile-nav-to-controls: 22px;[\s\S]*--mobile-controls-to-content: 28px;[\s\S]*--mobile-sidebar-to-content: 48px;/);
  assert.match(styles, /\.discover-page\[data-view="grid"\] \.discover-toolbar \{[\s\S]*padding-top: var\(--mobile-nav-to-controls\)/);
  assert.match(styles, /\.discover-page\[data-view="grid"\] \.discover-stream \{[\s\S]*padding-top: var\(--mobile-controls-to-content\)/);
  assert.match(profile, /padding-top: var\(--mobile-content-start\)/);
  assert.match(profile, /margin: 32px 0 var\(--mobile-profile-links-to-work\)/);
  assert.match(archive, /padding-top: var\(--mobile-content-start\)/);
  assert.match(archive, /margin-top: var\(--mobile-sidebar-to-content\)/);
  assert.match(agenda, /padding-top: var\(--mobile-content-start\)/);
  assert.match(agenda, /margin-top: var\(--mobile-sidebar-to-content\)/);
});

test("Discover SINGLE keeps its existing stream spacing outside the grid-only rhythm rule", async () => {
  const styles = await source("../styles.css");
  const mobileRhythmBlock = styles.match(/@media \(max-width: 700px\) \{[\s\S]*?\.discover-page\[data-view="grid"\] \.discover-stream \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(styles, /\.discover-stream \{[\s\S]*padding-top: calc\(var\(--header-height\) \+ 24px\)/);
  assert.doesNotMatch(mobileRhythmBlock, /\.discover-page\[data-view="single"\] \.discover-stream/);
});
