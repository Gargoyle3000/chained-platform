import assert from "node:assert/strict";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { npxExecutable, resolveBrowserExecutable } from "./platform-tools.mjs";

test("browser resolution honors CHROME_PATH before discovered commands", () => {
  assert.equal(resolveBrowserExecutable({
    env: { CHROME_PATH: "/custom/chrome", PATH: "" },
    platform: "linux"
  }), "/custom/chrome");
});

test("browser resolution follows the documented Linux command order", async () => {
  const directory = join(tmpdir(), `chained-browser-resolution-${process.pid}`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(join(directory, "chromium"), "");
    await writeFile(join(directory, "google-chrome"), "");
    await chmod(join(directory, "chromium"), 0o755);
    await chmod(join(directory, "google-chrome"), 0o755);
    assert.equal(resolveBrowserExecutable({ env: { PATH: directory }, platform: "linux" }), "google-chrome");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("platform npx executable is explicit", () => {
  assert.equal(npxExecutable("win32"), "npx.cmd");
  assert.equal(npxExecutable("linux"), "npx");
});
