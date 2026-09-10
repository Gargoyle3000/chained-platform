import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Profile Work stage uses the same metadata-gap centering shift as Discover", async () => {
  const [profile, styles] = await Promise.all([
    readFile(new URL("../profile.css", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8")
  ]);
  assert.match(styles, /--discover-meta-width[\s\S]*--discover-gap[\s\S]*transform: translateX\(/);
  assert.match(profile, /\.profile-image-link \{[\s\S]*transform: translateX\([\s\S]*var\(--work-meta-width\)[\s\S]*var\(--work-gap\)/);
  assert.match(profile, /@media \(max-width: 700px\)[\s\S]*\.profile-image-link \{[\s\S]*transform: none;/);
  assert.doesNotMatch(profile, /\.profile-image-link img \{[\s\S]*object-fit:\s*cover/);
});
