import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Supabase Work pages do not probe legacy prototype Work storage", async () => {
  const [editor, list, repository] = await Promise.all([
    readFile(new URL("../dashboard-form.js", import.meta.url), "utf8"),
    readFile(new URL("../dashboard-works.js", import.meta.url), "utf8"),
    readFile(new URL("../data/work-repository.mjs", import.meta.url), "utf8")
  ]);

  const productionSources = `${editor}\n${list}`;
  assert.equal(productionSources.includes("getPrototypeWorkCount"), false);
  assert.equal(productionSources.includes("LOCAL PROTOTYPE WORKS HAVE NOT BEEN IMPORTED"), false);
  assert.equal(repository.includes("getPrototypeWorkCount"), false);
  assert.equal(repository.includes("createIndexedDbWorkRepository"), true);
});
