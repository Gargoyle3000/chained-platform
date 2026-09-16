import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop single-Work stages center within the viewport below navigation", async () => {
  const [styles, profile, profilePage] = await Promise.all([
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
    readFile(new URL("../profile.css", import.meta.url), "utf8"),
    readFile(new URL("../profile.html", import.meta.url), "utf8")
  ]);

  assert.match(styles, /@media \(min-width: 701px\) \{[\s\S]*\.discover-page:is\(\.following-page, \[data-discover-channel="nosy"\]\)\[data-view="single"\] \.discover-stream \{[\s\S]*padding-top: var\(--header-height\);[\s\S]*\.discover-page\[data-view="single"\] \.discover-work \{[\s\S]*min-height: calc\(100svh - var\(--header-height\)\);[\s\S]*padding-top: 0;[\s\S]*padding-bottom: 0;/);
  assert.match(profilePage, /<body class="profile-page profile-dynamic-page profile-works-page">/);
  assert.match(profile, /@media \(min-width: 701px\) \{[\s\S]*\.profile-works-page \.artist-profile \{[\s\S]*padding-top: var\(--header-height\);[\s\S]*\.profile-works-page \.profile-work \{[\s\S]*min-height: calc\(100svh - var\(--header-height\)\);/);
  assert.match(profile, /@media \(max-width: 700px\)[\s\S]*\.profile-work \{[\s\S]*min-height: 0;/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.discover-page\[data-view="single"\] \.discover-work \{[\s\S]*min-height: 0;/);
});
