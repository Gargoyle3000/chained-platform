import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("authenticated navigation materializes only from the explicit Discover template", async () => {
  const source = await readFile(new URL("../auth/navigation.mjs", import.meta.url), "utf8");
  assert.match(source, /template\[data-authenticated-navigation\]/);
  assert.match(source, /data-anonymous-login/);
  assert.match(source, /template\.remove\(\)/);
  assert.match(source, /ensureSessionIndicator\(actions, client\)/);
});
