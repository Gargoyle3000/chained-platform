import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the visible Follow destination retains the existing route", async () => {
  const [follow, dashboard, archive, discover] = await Promise.all([
    readFile(new URL("../following.html", import.meta.url), "utf8"),
    readFile(new URL("../dashboard.html", import.meta.url), "utf8"),
    readFile(new URL("../archive.html", import.meta.url), "utf8"),
    readFile(new URL("../discover.html", import.meta.url), "utf8")
  ]);
  for (const page of [follow, dashboard, archive, discover]) {
    assert.match(page, /href="following\.html">FOLLOW</);
    assert.doesNotMatch(page, /href="following\.html">FOLLOWING</);
  }
  assert.match(follow, /class="is-active" href="following\.html">FOLLOW</);
});
