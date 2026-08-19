import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Dashboard intro uses a static plus marker and preserves identity hydration", async () => {
  const page = await readFile(new URL("../dashboard.html", import.meta.url), "utf8");

  assert.match(page, /class="dashboard-page-marker" aria-hidden="true">\+<\/div>/);
  assert.doesNotMatch(page, /<h1[^>]*>\s*DASHBOARD\s*<\/h1>/);
  assert.match(page, /data-dashboard-profile-name/);
  assert.match(page, /data-dashboard-account-type>ARTIST ACCOUNT/);
  assert.match(page, /class="dashboard-link is-active"[\s\S]*href="dashboard\.html"/);
});
