import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";

import { resolveBrowserExecutable } from "./platform-tools.mjs";

const root = resolve(import.meta.dirname, "..");
const chromePath = resolveBrowserExecutable();
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500"><rect width="1000" height="1500" fill="#00D422"/></svg>');

const mocks = new Map([
  ["/auth/public-navigation.mjs", ""],
  ["/auth/config.mjs", 'export const FRONTEND_MODES = { PROTOTYPE: "prototype", SUPABASE: "supabase" };'],
  ["/auth/supabase-client.mjs", 'export async function getFrontendConfig() { return { mode: "supabase" }; }'],
  ["/data/discover-repository.mjs", `
    export const DISCOVER_INITIAL_BATCH = 12;
    export async function getDiscoverRepository() {
      const works = Array.from({ length: 23 }, (_, index) => {
        const base = location.origin + "/media/" + index + "/";
        return {
          id: "work-" + index, artistSlug: "artist-" + index,
          artistName: "ARTIST " + index, title: "WORK " + index,
          artworkHref: "artwork.html?id=" + index,
          profileHref: "profile.html?slug=artist-" + index,
          image: { src: base + "small.webp", smallSrc: base + "small.webp",
            largeSrc: base + "large.webp", width: 1000, height: 1500 }
        };
      });
      return { runtime: { mode: "supabase", client: {}, config: {} },
        repository: { listWorks: async () => works } };
    }
  `],
  ["/data/discover-ordering.mjs", `
    export function createDiscoverBatchState(items, size) {
      let count = 0;
      return { next() {
        const appended = items.slice(count, count + size);
        count += appended.length;
        return { appended, hasMore: count < items.length };
      } };
    }
  `],
  ["/data/discover-filter-state.mjs", `
    export function createDiscoverFilterState() {
      return { selected: () => [], toggle() {}, clear() {} };
    }
    export function createDiscoverRequestGate() {
      let version = 0;
      return { next: () => ++version, isCurrent: (value) => value === version };
    }
  `],
  ["/data/discover-channel-state.mjs", `
    export function createDiscoverChannelState() {
      let channel = "nosy";
      return { current: () => channel, select: (value) => (channel = value) };
    }
  `],
  ["/data/work-format-disciplines.mjs", "export const FORMAT_DISCIPLINES = [];"],
  ["/data/archive-work-action.mjs", `
    export async function loadArchiveWorkState() { return null; }
    export function createArchiveWorkAction() { return null; }
  `],
  ["/data/public-work-images.mjs", `
    export function createPublicWorkImageLoader() { return { load: async () => [] }; }
  `],
  ["/public-work-carousel.mjs", `
    export function attachPublicWorkCarousel() {}
    export function createPublicWorkCarouselControls() { return null; }
  `],
  ["/saved-works.js", ""],
  ["/scroll-indicators.js", ""]
]);

test("Discover GRID bounds initial SMALL image requests and reserves geometry in Chrome", {
  skip: !chromePath && "Chrome is unavailable"
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), "chained-grid-network-"));
  const requests = [];
  let server;
  let chrome;
  let socket;
  let sequence = 0;
  const pending = new Map();

  try {
    server = createServer(async (request, response) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname.startsWith("/media/")) {
        requests.push(pathname);
        await wait(500);
        response.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" }).end(svg);
        return;
      }
      if (pathname === "/blank") {
        response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>blank</title>");
        return;
      }
      if (mocks.has(pathname)) {
        response.writeHead(200, { "Content-Type": pathname.endsWith(".js") ? "text/javascript" : "text/javascript; charset=utf-8" }).end(mocks.get(pathname));
        return;
      }
      try {
        const target = resolve(root, pathname.replace(/^\/+/, ""));
        if (!target.startsWith(root + sep)) throw new Error("outside_repo");
        const bytes = await readFile(target);
        const type = ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript" })[extname(target)] || "application/octet-stream";
        response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(bytes);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    chrome = spawn(chromePath, [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-breakpad",
      "--disable-crash-reporter", "--remote-debugging-port=0",
      `--user-data-dir=${profile}`, "about:blank"
    ], { stdio: "ignore", windowsHide: true });

    let port;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
        if (port) break;
      } catch {}
      await wait(100);
    }
    assert.ok(port, "Chrome exposes a local debugging port");
    const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((entry) => entry.type === "page");
    assert.ok(target?.webSocketDebuggerUrl);
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, reject) => {
      socket.addEventListener("open", done, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(JSON.stringify(message.error)));
      else task.resolve(message.result);
    });
    const command = (method, params = {}) => new Promise((done, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve: done, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await command("Runtime.evaluate", { expression, returnByValue: true });
      assert.equal(result.exceptionDetails, undefined, "browser expression succeeds");
      return result.result.value;
    };
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Network.enable");
    await command("Network.setCacheDisabled", { cacheDisabled: true });

    async function visit(width, view) {
      await command("Emulation.setDeviceMetricsOverride", {
        width, height: 900, deviceScaleFactor: width <= 390 ? 2 : 1, mobile: width <= 390
      });
      await command("Page.navigate", { url: `${origin}/blank` });
      await evaluate(`localStorage.setItem("chained-discover-view", "${view}")`);
      requests.length = 0;
      await command("Page.navigate", { url: `${origin}/discover.html` });
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (await evaluate("document.querySelectorAll('.discover-work').length >= 12")) break;
        await wait(100);
      }
      assert.ok(await evaluate("document.querySelectorAll('.discover-work').length >= 12"), "initial batch renders");
      const before = await evaluate("document.querySelector('.discover-work .discover-image-link').getBoundingClientRect().height");
      await wait(1300);
      const state = await evaluate(`(() => {
        const cards = [...document.querySelectorAll(".discover-work")];
        const image = cards[0].querySelector("img");
        const rect = image.getBoundingClientRect();
        return {
          count: cards.length,
          currentSrc: image.currentSrc,
          source: cards[0].querySelector("source")?.srcset,
          loading: image.loading,
          width: Number(image.getAttribute("width")),
          height: Number(image.getAttribute("height")),
          renderedRatio: rect.width / rect.height,
          linkHeight: image.closest(".discover-image-link").getBoundingClientRect().height,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
      })()`);
      return { state, before, requested: [...requests] };
    }

    for (const width of [390, 700, 701, 1440]) {
      const { state, before, requested } = await visit(width, "grid");
      assert.match(state.currentSrc, /\/small\.webp$/, `GRID ${width}px uses SMALL`);
      assert.match(state.source, /\/small\.webp$/, `GRID ${width}px source stays SMALL`);
      assert.equal(state.loading, "lazy");
      assert.equal(state.width / state.height, 2 / 3);
      assert.ok(Math.abs(state.renderedRatio - 2 / 3) < 0.02, `GRID ${width}px preserves image ratio`);
      assert.ok(Math.abs(state.linkHeight - before) < 2, `GRID ${width}px reserves geometry before load`);
      assert.equal(state.overflow, false, `GRID ${width}px has no horizontal overflow`);
      assert.ok(requested.every((path) => path.endsWith("/small.webp")), `GRID ${width}px never requests LARGE`);
      t.diagnostic(`GRID ${width}px: ${state.count} cards, ${requested.length} SMALL requests after 1.3s`);
      if (width === 1440) {
        assert.equal(state.count, 12, "desktop GRID does not prematurely append a second batch");
        assert.ok(requested.length <= 10, "desktop GRID does not request the whole initial batch");
        assert.ok(requested.length < 23, "desktop GRID has no 23-image request storm");
      }
    }

    const single = await visit(1440, "single");
    assert.match(single.state.currentSrc, /\/large\.webp$/, "SINGLE retains LARGE");
    assert.equal(single.state.overflow, false, "SINGLE has no horizontal overflow");
    await evaluate('document.querySelector(".view-button[data-view=grid]").click()');
    assert.match(await evaluate('document.querySelector(".discover-work source").srcset'), /\/small\.webp$/, "switching to GRID selects SMALL");
    await wait(600);
    assert.match(await evaluate('document.querySelector(".discover-work img").currentSrc'), /\/small\.webp$/, "switching to GRID uses SMALL");
    await evaluate('document.querySelector(".view-button[data-view=single]").click()');
    await wait(600);
    assert.match(await evaluate('document.querySelector(".discover-work img").currentSrc'), /\/large\.webp$/, "switching back to SINGLE uses LARGE");
  } finally {
    socket?.close();
    chrome?.kill();
    await new Promise((done) => server?.close(done) || done());
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
