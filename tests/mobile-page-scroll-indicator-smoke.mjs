import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBrowserExecutable } from "./platform-tools.mjs";

const browserPath = resolveBrowserExecutable();
const profile = await mkdtemp(join(tmpdir(), "chained-page-indicator-"));
const port = 9334;
const pending = new Map();
let browser;
let socket;
let nextId = 0;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function command(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true });
  return result.result.value;
}

try {
  if (!browserPath) throw new Error("chrome_unavailable");
  browser = spawn(browserPath, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-breakpad",
    "--disable-crash-reporter", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "about:blank"
  ], { stdio: "ignore", windowsHide: true });

  let target;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = targets.find((entry) => entry.type === "page");
      if (target?.webSocketDebuggerUrl) break;
    } catch {}
    await wait(100);
  }
  if (!target?.webSocketDebuggerUrl) throw new Error("chrome_debug_unavailable");

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error("cdp_command_failed"));
    else resolve(message.result);
  });
  await command("Page.enable");

  const cases = [
    ...["intro.html", "discover.html", "following.html", "dashboard.html", "archive.html", "profile.html"]
      .map((page) => ({ page, width: 390, height: 844 })),
    { page: "intro.html", width: 320, height: 700 },
    { page: "intro.html", width: 1440, height: 900 },
    { page: "dashboard.html", width: 1920, height: 900 }
  ];

  for (const { page, width, height } of cases) {
    const mobile = width <= 700;
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await command("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 1 });
    await command("Page.navigate", { url: `http://127.0.0.1:5500/${page}` });
    await wait(1100);

    const initial = await evaluate(`(() => ({
      enabled: document.documentElement.classList.contains('chained-mobile-page-scrollbar'),
      hidden: document.querySelector('.chained-page-scroll-indicator')?.hidden ?? true,
      pageWidth: getComputedStyle(document.documentElement, '::-webkit-scrollbar').width
    }))()`);
    assert.equal(initial.enabled, mobile, `${page} enables only on touch mobile at ${width}px`);
    if (!mobile) {
      assert.equal(initial.hidden, true, `${page} hides the custom indicator on desktop`);
      assert.equal(initial.pageWidth, "6px", `${page} keeps the 6px desktop scrollbar`);
      if (page === "dashboard.html") {
        const compact = await evaluate("getComputedStyle(document.querySelector('.dashboard-work-list'), '::-webkit-scrollbar').width");
        assert.equal(compact, "2px", "Dashboard keeps its 2px compact scrollbar");
      }
      continue;
    }

    await evaluate(`(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '2200px';
      spacer.setAttribute('aria-hidden', 'true');
      document.body.append(spacer);
    })()`);
    await wait(100);
    await evaluate("window.scrollTo({ top: 500, behavior: 'instant' })");
    await wait(100);
    const active = await evaluate(`(() => {
      const bar = document.querySelector('.chained-page-scroll-indicator');
      const scroller = document.scrollingElement;
      return {
        top: scroller.scrollTop,
        viewport: document.documentElement.clientHeight,
        content: Math.max(scroller.scrollHeight, document.body.scrollHeight),
        barTop: bar.getBoundingClientRect().top,
        barHeight: bar.getBoundingClientRect().height,
        width: getComputedStyle(bar).width,
        color: getComputedStyle(bar).backgroundColor,
        opacity: getComputedStyle(bar).opacity,
        pointerEvents: getComputedStyle(bar).pointerEvents,
        nativeWidth: getComputedStyle(document.documentElement).scrollbarWidth
      };
    })()`);
    assert.ok(active.top > 0, `${page} still scrolls at ${width}px`);
    assert.equal(active.width, "3px", `${page} indicator is 3px`);
    assert.equal(active.color, "rgb(0, 252, 40)", `${page} indicator uses CHAINED green`);
    assert.equal(active.pointerEvents, "none", `${page} indicator leaves touch input alone`);
    assert.equal(active.nativeWidth, "none", `${page} requests native scrollbar suppression`);
    assert.ok(Number(active.opacity) > 0, `${page} indicator appears while scrolling`);
    const expectedHeight = Math.max(18, Math.round(active.viewport ** 2 / active.content));
    const expectedTop = Math.round((active.viewport - expectedHeight) * active.top / (active.content - active.viewport));
    assert.ok(Math.abs(active.barHeight - expectedHeight) <= 2, `${page} indicator reflects viewport ratio`);
    assert.ok(Math.abs(active.barTop - expectedTop) <= 2, `${page} indicator follows scroll progress`);

    if (page === "intro.html" && width === 390) {
      await evaluate("window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' })");
      await wait(100);
      const atBottom = await evaluate(`(() => {
        const bar = document.querySelector('.chained-page-scroll-indicator').getBoundingClientRect();
        return { bottom: bar.bottom, viewport: document.documentElement.clientHeight };
      })()`);
      assert.ok(Math.abs(atBottom.bottom - atBottom.viewport) <= 2, "indicator reaches the page bottom");
      await evaluate("window.scrollTo({ top: 0, behavior: 'instant' })");
      await wait(100);
      const atTop = await evaluate("document.querySelector('.chained-page-scroll-indicator').getBoundingClientRect().top");
      assert.ok(Math.abs(atTop) <= 2, "indicator returns to the page top");
    }

    await wait(900);
    const opacity = await evaluate("getComputedStyle(document.querySelector('.chained-page-scroll-indicator')).opacity");
    assert.equal(opacity, "0", `${page} indicator fades after scrolling stops`);

    if (page === "intro.html" && width === 390) {
      await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 700, deviceScaleFactor: 1, mobile: true });
      await wait(150);
      const resized = await evaluate(`(() => ({
        viewport: document.documentElement.clientHeight,
        content: document.scrollingElement.scrollHeight,
        barHeight: document.querySelector('.chained-page-scroll-indicator').getBoundingClientRect().height
      }))()`);
      const expected = Math.max(18, Math.round(resized.viewport ** 2 / resized.content));
      assert.ok(Math.abs(resized.barHeight - expected) <= 2, "orientation-sized viewport recalculates the indicator");
      await evaluate(`(() => {
        const bar = document.querySelector('.chained-page-scroll-indicator');
        document.body.replaceChildren(bar);
      })()`);
      await wait(150);
      const shortPage = await evaluate(`(() => ({
        hidden: document.querySelector('.chained-page-scroll-indicator').hidden,
        viewport: document.documentElement.clientHeight,
        content: document.scrollingElement.scrollHeight
      }))()`);
      assert.ok(shortPage.content <= shortPage.viewport + 1, "short test page has no scroll range");
      assert.equal(shortPage.hidden, true, "short page hides the indicator");
      await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await command("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
      await wait(150);
      const desktopSwitch = await evaluate(`(() => ({
        enabled: document.documentElement.classList.contains('chained-mobile-page-scrollbar'),
        hidden: document.querySelector('.chained-page-scroll-indicator').hidden
      }))()`);
      assert.deepEqual(desktopSwitch, { enabled: false, hidden: true }, "switching to mouse desktop disables the custom indicator");
    }
  }
  process.stdout.write(JSON.stringify({ ok: true, pages: cases.length }));
} catch (error) {
  process.stderr.write(`Mobile page indicator smoke failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  try { browser?.kill(); } catch {}
  await wait(500);
  await rm(profile, { recursive: true, force: true });
}
