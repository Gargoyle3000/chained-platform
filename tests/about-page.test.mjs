import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ROOT_DASHBOARD_DESTINATION,
  ROOT_INTRO_DESTINATION,
  ROOT_SPLASH_MINIMUM_MS,
  resolveRootDestination,
  routeRoot
} from "../root-router.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the public introduction remains separate from the minimal root splash", async () => {
  const [root, page, css, rootCss, router] = await Promise.all([
    read("index.html"),
    read("intro.html"),
    read("about.css"),
    read("root.css"),
    read("root-router.mjs")
  ]);

  assert.match(root, /class="root-splash-page"/);
  assert.match(root, /class="root-splash" aria-label="CHAINED"/);
  assert.match(root, /class="root-splash-wordmark">&lt;CHAINED&gt;<\/p>/);
  assert.match(root, /root\.css/);
  assert.match(root, /root-router\.mjs/);
  assert.doesNotMatch(root, /about-intro|about-actions|PRIVATE ACCESS|\[ \? \]/);
  assert.match(rootCss, /\.root-splash \{[\s\S]*min-height: 100svh;[\s\S]*place-items: center;/);
  assert.match(rootCss, /\.root-splash-wordmark \{[\s\S]*color: var\(--accent\);[\s\S]*font-size: var\(--font-wordmark\);/);
  assert.doesNotMatch(page, /<header class="site-header" data-public-header>/);
  assert.match(page, /<h1 id="about-title">&lt;CHAINED&gt;<\/h1>/);
  assert.doesNotMatch(page, /class="about-label">ABOUT/);
  assert.match(css, /\.about-intro h1 \{[\s\S]*color: var\(--accent\);/);
  assert.doesNotMatch(css, /\.about-section \{[\s\S]*border-top/);
  assert.match(page, /Digital infrastructure for the professional art practice\./);
  assert.match(page, /<h2 id="about-portfolio">PORTFOLIO<\/h2>/);
  assert.match(page, /<h2 id="about-network">NETWORK<\/h2>/);
  assert.match(page, /<h2 id="about-workspace">WORKSPACE<\/h2>/);
  assert.match(page, /not a social[\s\S]*?media alternative, but a professional tool\./);
  assert.match(page, /href="discover\.html">\[ DISCOVER \]<\/a>/);
  assert.match(page, /href="agenda\.html">\[ AGENDA \]<\/a>/);
  assert.match(page, /href="login\.html">\[ PRIVATE ACCESS \]<\/a>/);
  assert.match(page, /scroll-indicators\.js/);
  assert.match(css, /\.about-summary \{[\s\S]*grid-template-columns: minmax\(0, 820px\) max-content;/);
  assert.match(css, /\.about-section h2 \{[\s\S]*font-weight: 700;/);
  assert.match(css, /\.about-actions \{[\s\S]*flex-wrap: nowrap;/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*\.about-actions \{[\s\S]*flex-direction: column;/);
  assert.doesNotMatch(page, /pricing|testimonial|funding|alpha/i);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /grid-template-columns: 1fr;/);
  assert.doesNotMatch(css, /box-shadow|gradient|border-radius/);
  assert.match(router, /readApplicationSession/);
  assert.match(router, /ROOT_SPLASH_MINIMUM_MS = 300/);
  assert.match(router, /window\.location\.replace\(destination\)/);
  assert.doesNotMatch(router, /onAuthStateChange/);
});

test("Private Access keeps functional field borders without decorative panel dividers", async () => {
  const css = await read("auth/auth.css");

  assert.doesNotMatch(css, /\.auth-panel\s*\{[\s\S]*border-top/);
  assert.match(css, /\.auth-field input\s*\{[\s\S]*border-bottom: var\(--border\);/);
});

test("Discover retains its canonical anonymous header and legacy About forwards to the public intro", async () => {
  const [discover, about, navigation] = await Promise.all([
    read("discover.html"),
    read("about.html"),
    read("auth/navigation.mjs")
  ]);

  assert.match(discover, /data-anonymous-login href="login\.html">\[ LOG IN \]<\/a>/);
  assert.doesNotMatch(discover, />\[ ABOUT \]</);
  assert.match(about, /http-equiv="refresh" content="0; url=intro\.html"/);
  assert.match(navigation, /querySelector\("\[data-anonymous-login\]"\)\?\.remove\(\)/);
});

test("root routes an active session to the canonical Dashboard after the intentional splash", async () => {
  const destinations = [];
  const waits = [];
  const clock = [0, 40];

  const destination = await routeRoot({
    getRuntime: async () => ({ mode: "supabase", client: {} }),
    readSession: async () => ({ kind: "active" }),
    replace: (value) => destinations.push(value),
    wait: async (duration) => waits.push(duration),
    now: () => clock.shift()
  });

  assert.equal(destination, ROOT_DASHBOARD_DESTINATION);
  assert.deepEqual(destinations, [ROOT_DASHBOARD_DESTINATION]);
  assert.deepEqual(waits, [ROOT_SPLASH_MINIMUM_MS - 40]);
});

test("root keeps the splash while session resolution is pending and routes anonymous or failed checks to intro", async () => {
  const destinations = [];
  let resolveRuntime;
  const pendingRoute = routeRoot({
    getRuntime: () => new Promise((resolve) => { resolveRuntime = resolve; }),
    replace: (value) => destinations.push(value),
    wait: async () => {},
    now: () => 0
  });

  await Promise.resolve();
  assert.deepEqual(destinations, []);
  resolveRuntime({ mode: "supabase", client: {} });
  const pendingDestination = await pendingRoute;

  assert.equal(pendingDestination, ROOT_INTRO_DESTINATION);
  assert.deepEqual(destinations, [ROOT_INTRO_DESTINATION]);
  assert.equal(resolveRootDestination({ kind: "active" }), ROOT_DASHBOARD_DESTINATION);
  assert.equal(resolveRootDestination({ kind: "unauthenticated" }), ROOT_INTRO_DESTINATION);

  const failedDestinations = [];
  await routeRoot({
    getRuntime: async () => { throw new Error("unavailable"); },
    replace: (value) => failedDestinations.push(value),
    wait: async () => {},
    now: () => 0
  });
  assert.deepEqual(failedDestinations, [ROOT_INTRO_DESTINATION]);
});

test("root router remains root-only and logout continues to clear the session before navigation", async () => {
  const [profile, artwork, presentation, agenda, discover, following, navigation] = await Promise.all([
    read("profile.html"),
    read("artwork.html"),
    read("presentation.html"),
    read("agenda.html"),
    read("discover.html"),
    read("following.html"),
    read("auth/navigation.mjs")
  ]);

  for (const page of [profile, artwork, presentation, agenda, discover, following]) {
    assert.doesNotMatch(page, /root-router\.mjs/);
  }
  assert.match(navigation, /await client\.auth\.signOut\(\);[\s\S]*window\.location\.replace\("login\.html"\)/);
});
