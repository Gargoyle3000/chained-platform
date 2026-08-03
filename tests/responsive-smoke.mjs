import { spawn } from "node:child_process";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const config = join(root, "frontend-config.local.mjs");
const disabledConfig = join(root, "frontend-config.local.mjs.responsive-smoke");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(join(tmpdir(), "chained-responsive-"));
const results = [];
let chrome;
let socket;
let sequence = 0;
const pending = new Map();
const listeners = new Map();

function wait(milliseconds) { return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)); }

async function getDebugTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await (await fetch("http://127.0.0.1:9333/json/list")).json();
      const pageTarget = targets.find((target) => target.type === "page");
      if (pageTarget?.webSocketDebuggerUrl) return pageTarget;
    } catch {}
    await wait(100);
  }
  throw new Error("chrome_debug_unavailable");
}

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolvePromise, rejectPromise) => pending.set(id, { resolvePromise, rejectPromise }));
}

function once(method) {
  return new Promise((resolvePromise) => listeners.set(method, resolvePromise));
}

try {
  if (!existsSync(chromePath)) throw new Error("chrome_unavailable");
  if (existsSync(disabledConfig)) throw new Error("stale_disabled_config");
  if (existsSync(config)) await rename(config, disabledConfig);

  chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-breakpad", "--disable-crash-reporter", "--remote-debugging-port=9333",
    `--user-data-dir=${profile}`, "about:blank"
  ], { stdio: "ignore", windowsHide: true });

  const target = await getDebugTarget();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", rejectPromise, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const resolver = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) resolver.rejectPromise(new Error("cdp_command_failed"));
      else resolver.resolvePromise(message.result);
      return;
    }
    const listener = listeners.get(message.method);
    if (listener) { listeners.delete(message.method); listener(message.params); }
  });
  await command("Page.enable");

  for (const width of [1440, 390, 320]) {
    for (const page of ["dashboard-works.html", "dashboard-work-edit.html", "artwork.html"]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: width === 1440 ? 900 : 844, deviceScaleFactor: 1, mobile: width < 700 });
      const loaded = once("Page.loadEventFired");
      await command("Page.navigate", { url: `http://127.0.0.1:5500/${page}` });
      await Promise.race([loaded, wait(5000)]);
      await wait(1200);
      const evaluation = await command("Runtime.evaluate", {
        expression: `(() => {
          const header = document.querySelector('.site-header')?.getBoundingClientRect();
          const main = document.querySelector('main')?.getBoundingClientRect();
          const contentTop = Math.min(...[...document.querySelectorAll('main > *')].map((element) => element.getBoundingClientRect().top).filter((value) => Number.isFinite(value)));
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            protected: document.body.hasAttribute('data-auth-protected'),
            headerBottom: header?.bottom || 0,
            mainTop: Number.isFinite(contentTop) ? contentTop : main?.top || 0,
            hasMain: Boolean(main),
            text: document.body.innerText.slice(0, 200)
          };
        })()`,
        returnByValue: true
      });
      const value = evaluation.result.value;
      assert.equal(value.hasMain, true, `${page} has main content at ${width}px`);
      assert.equal(value.protected, false, `${page} prototype content is revealed at ${width}px`);
      assert.equal(value.overflow, false, `${page} has no horizontal overflow at ${width}px`);
      assert.ok(value.mainTop >= value.headerBottom - 1, `${page} starts below the full header at ${width}px`);
      results.push(`${page}:${width}`);
    }
  }
  process.stdout.write(JSON.stringify({ ok: true, viewports: results.length }));
} catch (error) {
  process.stderr.write(`Responsive smoke test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  if (existsSync(disabledConfig) && !existsSync(config)) await rename(disabledConfig, config);
  await wait(500);
  if (resolve(profile).startsWith(resolve(tmpdir()))) {
    try { await rm(profile, { recursive: true, force: true }); } catch {}
  }
}
