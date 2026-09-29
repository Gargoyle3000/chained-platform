import { spawn } from "node:child_process";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { resolveBrowserExecutable } from "./platform-tools.mjs";

const root = resolve(import.meta.dirname, "..");
const config = join(root, "frontend-config.local.mjs");
const disabledConfig = join(root, "frontend-config.local.mjs.responsive-smoke");
const chromePath = resolveBrowserExecutable();
const profile = await mkdtemp(join(tmpdir(), "chained-responsive-"));
const screenshotDirectory = await mkdtemp(join(tmpdir(), "chained-responsive-screenshots-"));
const results = [];
const screenshots = [];
let chrome;
let socket;
let sequence = 0;
const pending = new Map();
const listeners = new Map();
const requestedPages = process.env.CHAINED_RESPONSIVE_PAGES?.split(",").map((page) => page.trim()).filter(Boolean);
const responsivePages = requestedPages?.length
  ? requestedPages
  : ["dashboard-works.html", "dashboard-portfolio-export.html", "dashboard-work-edit.html", "archive.html", "artwork.html", "login.html", "password-update.html"];

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
  if (!chromePath) throw new Error("chrome_unavailable");
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

  const widths = responsivePages.length === 1 && responsivePages[0] === "dashboard.html"
    ? [1920, 1881, 1880, 1440, 1101, 1100, 900, 701, 700, 412, 390, 360, 320]
    : [1440, 390, 320];
  for (const width of widths) {
    for (const page of responsivePages) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: width === 1440 ? 900 : 844, deviceScaleFactor: 1, mobile: width < 700 });
      const loaded = once("Page.loadEventFired");
      const pageUrl = page === "dashboard-cv.html"
        ? `${page}?cv-export-state=selection`
        : page;
      await command("Page.navigate", { url: `http://127.0.0.1:5500/${pageUrl}` });
      await Promise.race([loaded, wait(5000)]);
      await wait(1200);
      if (page === "dashboard-cv.html") {
        await command("Runtime.evaluate", {
          expression: "document.querySelector('#dashboard-cv-export')?.click()"
        });
        await wait(80);
      }
      const evaluation = await command("Runtime.evaluate", {
        expression: `(() => {
          if (document.body.classList.contains('dashboard-overview-page')) {
            const title = document.querySelector('#dashboard-recent-work-list .dashboard-work-information h3 a');
            if (title) title.textContent = 'A LONG WORK TITLE WITH SEVERAL WORDS AND AN EXTENDED UNBROKENREFERENCE';
            const presentations = document.querySelector('#dashboard-recent-presentation-list');
            if (presentations) {
              const row = document.createElement('article');
              row.className = 'dashboard-recent-presentation-row';
              const information = document.createElement('div');
              information.className = 'dashboard-recent-presentation-information';
              const heading = document.createElement('h3');
              heading.textContent = 'A LONG PRESENTATION TITLE WITH SEVERAL WORDS';
              const date = document.createElement('p');
              date.textContent = '2026';
              information.append(heading, date);
              const status = document.createElement('span');
              status.className = 'is-published';
              status.textContent = 'PUBLISHED';
              row.append(information, status);
              presentations.replaceChildren(row);
            }
          }
          const header = document.querySelector('.site-header')?.getBoundingClientRect();
          const navigation = document.querySelector('.main-nav-with-dashboard');
          const headerContent = header ? (() => {
            const style = getComputedStyle(document.querySelector('.site-header'));
            return {
              left: header.left + parseFloat(style.paddingLeft),
              right: header.right - parseFloat(style.paddingRight)
            };
          })() : null;
          const main = document.querySelector('main')?.getBoundingClientRect();
          const latestMain = document.querySelector('.dashboard-latest-main');
          const recentWorkRow = document.querySelector('#dashboard-recent-work-list .dashboard-work-row');
          const recentWorkTitle = recentWorkRow?.querySelector('h3')?.getBoundingClientRect();
          const recentWorkStatus = recentWorkRow?.querySelector(':scope > .is-published, :scope > .is-draft')?.getBoundingClientRect();
          const recentWorkBox = recentWorkRow?.getBoundingClientRect();
          const recentWorkList = document.querySelector('#dashboard-recent-work-list');
          const presentationRow = document.querySelector('#dashboard-recent-presentation-list .dashboard-recent-presentation-row');
          const presentationTitle = presentationRow?.querySelector('h3')?.getBoundingClientRect();
          const presentationStatus = presentationRow?.querySelector(':scope > span')?.getBoundingClientRect();
          const imageDialog = document.querySelector('.export-image-dialog');
          if (imageDialog && !imageDialog.open) imageDialog.showModal();
          const contentTop = Math.min(...[...document.querySelectorAll('main > *')].map((element) => element.getBoundingClientRect().top).filter((value) => Number.isFinite(value)));
          const rootScroller = document.scrollingElement;
          const dashboardScroller = document.querySelector(
            '.dashboard-work-list, .dashboard-recent-presentation-list'
          );
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            protected: document.body.hasAttribute('data-auth-protected'),
            portfolioLibraries: !document.querySelector('#portfolio-generate') || (Boolean(window.PDFLib) && Boolean(window.fontkit)),
            portfolioControls: !document.querySelector('#portfolio-generate') || Boolean(document.querySelector('#portfolio-work-selection') && document.querySelector('#portfolio-selected-works')),
            imagePicker: !imageDialog || (imageDialog.open && imageDialog.getBoundingClientRect().width <= document.documentElement.clientWidth),
            cvImportSurface: (() => {
              if (!document.querySelector('#dashboard-cv-import')) return true;
              const state = new URLSearchParams(location.search).get('cv-import-state');
              const exportState = new URLSearchParams(location.search).get('cv-export-state');
              const text = document.body.innerText;
              if (exportState === 'selection') return text.includes('EXPORT CV') && text.includes('1 ENTRY SELECTED') && text.includes('EXPORT 1 ENTRY');
              if (state === 'processing') return text.includes('PROCESSING CV...') && text.includes('EXTERNAL AI SERVICE');
              if (state === 'review') return text.includes('ENTRIES FOUND') && text.includes('ADD 10 ENTRIES');
              if (state === 'error') return text.includes('CV COULD NOT BE PROCESSED') && text.includes('TRY AGAIN') && text.includes('CANCEL');
              return Boolean(document.querySelector('#dashboard-cv-import-file')) && !text.includes('ENTRIES FOUND');
            })(),
            headerBottom: header?.bottom || 0,
            navigationLayout: navigation ? {
              navLeft: navigation.getBoundingClientRect().left,
              navRight: navigation.getBoundingClientRect().right,
              headerContentLeft: headerContent?.left,
              headerContentRight: headerContent?.right,
              items: [...navigation.querySelectorAll('a')].map((item) => {
                const rect = item.getBoundingClientRect();
                return {
                  label: item.textContent.replace(/\\s+/g, ' ').trim(),
                  top: rect.top,
                  left: rect.left,
                  right: rect.right,
                  width: rect.width,
                  height: rect.height,
                  clientWidth: item.clientWidth,
                  scrollWidth: item.scrollWidth
                };
              })
            } : null,
            mainTop: Number.isFinite(contentTop) ? contentTop : main?.top || 0,
            hasMain: Boolean(main),
            dashboardLayout: latestMain ? {
              columns: getComputedStyle(latestMain).gridTemplateColumns.split(' ').length,
              titleRight: recentWorkTitle?.right,
              statusLeft: recentWorkStatus?.left,
              statusRight: recentWorkStatus?.right,
              rowRight: recentWorkBox?.right,
              listRight: recentWorkList?.getBoundingClientRect().right,
              statusWhiteSpace: recentWorkStatus ? getComputedStyle(recentWorkRow.querySelector(':scope > .is-published, :scope > .is-draft')).whiteSpace : '',
              compactWidth: getComputedStyle(recentWorkList, '::-webkit-scrollbar').width,
              pageWidth: getComputedStyle(document.documentElement, '::-webkit-scrollbar').width
            } : null,
            presentationLayout: presentationRow ? {
              titleRight: presentationTitle.right,
              titleBottom: presentationTitle.bottom,
              statusLeft: presentationStatus.left,
              statusTop: presentationStatus.top,
              statusRight: presentationStatus.right,
              rowRight: presentationRow.getBoundingClientRect().right
            } : null,
            rootFitsDesktop: !document.body.classList.contains("about-page")
              || document.documentElement.clientWidth < 721
              || document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
            rootActionsSingleRow: !document.body.classList.contains("about-page")
              || document.documentElement.clientWidth < 361
              || new Set([...document.querySelectorAll(".about-actions a")]
                .map((element) => Math.round(element.getBoundingClientRect().top))).size === 1,
            scrollbar: {
              rootElement: rootScroller?.tagName || "",
              rootGutter: rootScroller
                ? getComputedStyle(rootScroller).scrollbarGutter
                : "",
              rootThumb: rootScroller
                ? getComputedStyle(rootScroller, '::-webkit-scrollbar-thumb').backgroundColor
                : "",
              dashboardThumb: dashboardScroller
                ? getComputedStyle(dashboardScroller, '::-webkit-scrollbar-thumb').backgroundColor
                : ""
            },
            text: document.body.innerText.slice(0, 200)
          };
        })()`,
        returnByValue: true
      });
      const value = evaluation.result.value;
      if (page === "dashboard.html") {
        if (width <= 720) {
          const nav = value.navigationLayout;
          assert.ok(nav, `Dashboard navigation exists at ${width}px`);
          assert.deepEqual(nav.items.map((item) => item.label), ["DISCOVER", "FOLLOW", "SELECTOR", "AGENDA", "PROFILE", "[+]"], `Dashboard navigation order at ${width}px`);
          assert.equal(new Set(nav.items.map((item) => Math.round(item.top))).size, 1, `all six Dashboard navigation items share one row at ${width}px`);
          assert.ok(Math.abs(nav.navLeft - nav.headerContentLeft) <= 1, `Dashboard nav starts at the available header width at ${width}px`);
          assert.ok(Math.abs(nav.navRight - nav.headerContentRight) <= 1, `Dashboard nav uses the full available header width at ${width}px`);
          assert.ok(Math.abs(nav.items[0].left - nav.navLeft) <= 1, `DISCOVER stays aligned to the nav left edge at ${width}px`);
          assert.ok(Math.abs(nav.items.at(-1).right - nav.navRight) <= 1, `[+] reaches the nav right edge at ${width}px`);
          assert.ok(nav.items.every((item) => item.scrollWidth <= item.clientWidth), `no Dashboard navigation label is clipped at ${width}px`);
          assert.ok(nav.items.at(-1).height >= 44, `[+] keeps a 44px mobile touch height at ${width}px`);
        }
        assert.equal(value.dashboardLayout.columns, width > 1880 ? 2 : 1, `Dashboard latest columns at ${width}px`);
        assert.ok(value.dashboardLayout.statusRight <= value.dashboardLayout.rowRight + 1, `Dashboard status remains in its row at ${width}px`);
        assert.equal(value.dashboardLayout.statusWhiteSpace, "nowrap", `Dashboard status does not wrap at ${width}px`);
        if (width >= 701) {
          assert.ok(value.dashboardLayout.titleRight <= value.dashboardLayout.statusLeft + 1, `Dashboard title clears status at ${width}px`);
          assert.ok(value.dashboardLayout.rowRight - value.dashboardLayout.statusRight <= 1, `Dashboard status aligns right at ${width}px`);
          assert.ok(value.presentationLayout.titleRight <= value.presentationLayout.statusLeft + 1, `Presentation title clears status at ${width}px`);
        } else {
          assert.ok(value.presentationLayout.titleBottom <= value.presentationLayout.statusTop + 1, `Mobile Presentation status follows title at ${width}px`);
        }
        assert.ok(value.presentationLayout.statusRight <= value.presentationLayout.rowRight + 1, `Presentation status stays in its row at ${width}px`);
        if (width >= 1881) {
          assert.equal(value.dashboardLayout.compactWidth, "2px", `Dashboard compact scrollbar is 2px at ${width}px`);
          assert.ok(value.dashboardLayout.listRight - value.dashboardLayout.statusRight >= 12, `Dashboard retains right breathing room at ${width}px`);
        }
        if (width >= 701) assert.equal(value.dashboardLayout.pageWidth, "6px", `Dashboard page scrollbar remains 6px at ${width}px`);

        const authenticatedHeader = await command("Runtime.evaluate", {
          expression: `(() => {
            const header = document.querySelector('.site-header');
            const navigation = header.querySelector('.main-nav-with-dashboard');
            const actions = document.createElement('div');
            actions.className = 'header-actions';
            navigation.before(actions);
            actions.append(navigation);
            const indicator = document.createElement('div');
            indicator.className = 'auth-session-indicator';
            indicator.textContent = '[ LOG OUT ]';
            actions.append(indicator);
            const contentStyle = getComputedStyle(header);
            const contentLeft = header.getBoundingClientRect().left + parseFloat(contentStyle.paddingLeft);
            const contentRight = header.getBoundingClientRect().right - parseFloat(contentStyle.paddingRight);
            return {
              overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
              navLeft: navigation.getBoundingClientRect().left,
              navRight: navigation.getBoundingClientRect().right,
              headerContentLeft: contentLeft,
              headerContentRight: contentRight,
              items: [...navigation.querySelectorAll('a')].map((item) => {
                const rect = item.getBoundingClientRect();
                return {
                  label: item.textContent.replace(/\\s+/g, ' ').trim(),
                  top: rect.top,
                  left: rect.left,
                  right: rect.right,
                  height: rect.height,
                  clientWidth: item.clientWidth,
                  scrollWidth: item.scrollWidth
                };
              })
            };
          })()`,
          returnByValue: true
        });
        const wrapped = authenticatedHeader.result.value;
        assert.equal(wrapped.overflow, false, `Authenticated Dashboard header has no overflow at ${width}px`);
        if (width <= 720) {
          assert.deepEqual(wrapped.items.map((item) => item.label), ["DISCOVER", "FOLLOW", "SELECTOR", "AGENDA", "PROFILE", "[+]"], `authenticated navigation order at ${width}px`);
          assert.equal(new Set(wrapped.items.map((item) => Math.round(item.top))).size, 1, `all six authenticated navigation items share one row at ${width}px`);
          assert.ok(Math.abs(wrapped.navLeft - wrapped.headerContentLeft) <= 1, `authenticated nav starts at available header width at ${width}px`);
          assert.ok(Math.abs(wrapped.navRight - wrapped.headerContentRight) <= 1, `authenticated nav uses full header width at ${width}px`);
          assert.ok(Math.abs(wrapped.items[0].left - wrapped.navLeft) <= 1, `authenticated DISCOVER stays left aligned at ${width}px`);
          assert.ok(Math.abs(wrapped.items.at(-1).right - wrapped.navRight) <= 1, `authenticated [+] reaches nav right edge at ${width}px`);
          assert.ok(wrapped.items.every((item) => item.scrollWidth <= item.clientWidth), `authenticated nav labels are not clipped at ${width}px`);
          assert.ok(wrapped.items.at(-1).height >= 44, `authenticated [+] keeps a 44px touch height at ${width}px`);
        }
      }
      if (width >= 1440) {
        assert.equal(value.scrollbar.rootElement, "HTML", `${page} scrolls through the document root`);
        assert.equal(value.scrollbar.rootGutter, "stable", `${page} keeps a stable scrollbar gutter`);
        assert.equal(value.scrollbar.rootThumb, "rgb(0, 252, 40)", `${page} gives the root scrollbar a CHAINED-green thumb`);
        if (page === "dashboard.html" && width >= 1881) {
          assert.equal(value.scrollbar.dashboardThumb, "rgb(0, 252, 40)", "Dashboard list scrollbar uses the CHAINED-green thumb");
        }
      }
      assert.equal(value.hasMain, true, `${page} has main content at ${width}px`);
      assert.equal(value.rootFitsDesktop, true, `${page} fits a normal desktop viewport without vertical scrolling`);
      assert.equal(value.rootActionsSingleRow, true, `${page} keeps landing actions in one row where space allows`);
      assert.equal(value.protected, false, `${page} prototype content is revealed at ${width}px`);
      assert.equal(value.overflow, false, `${page} has no horizontal overflow at ${width}px`);
      assert.equal(value.portfolioLibraries, true, `${page} PDF libraries load at ${width}px`);
      assert.equal(value.portfolioControls, true, `${page} portfolio controls render at ${width}px`);
      assert.equal(value.imagePicker, true, `${page} image picker opens without horizontal overflow at ${width}px`);
      assert.equal(value.cvImportSurface, true, `${page} CV import state renders at ${width}px`);
      assert.ok(value.mainTop >= value.headerBottom - 1, `${page} starts below the full header at ${width}px`);
      const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const screenshotPath = join(screenshotDirectory, `${page.replace(/[^a-z0-9]+/gi, "-")}-${width}.png`);
      await writeFile(screenshotPath, screenshot.data, "base64");
      screenshots.push(screenshotPath);
      results.push(`${page}:${width}`);
    }
  }
  process.stdout.write(JSON.stringify({ ok: true, viewports: results.length, screenshots: screenshots.length, screenshotDirectory }));
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
