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

test("public action slots use the shared right-side header position", async () => {
  const discover = await readFile(new URL("../discover.html", import.meta.url), "utf8");
  const login = await readFile(new URL("../login.html", import.meta.url), "utf8");

  assert.match(discover, /auth-session-indicator public-action-slot[\s\S]*data-anonymous-login[^>]+href="login\.html"[^>]*>\[ LOG IN \]/);
  assert.match(login, /auth-session-indicator public-action-slot[\s\S]*href="discover\.html"[^>]*>\[ DISCOVER \]/);
  assert.doesNotMatch(login, /<nav[^>]*>[\s\S]*>DISCOVER<\/a>[\s\S]*<\/nav>/);
});
